package main

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"sync"

	"github.com/creack/pty"
)

type request struct {
	Type        string `json:"type"`
	StreamID    string `json:"streamId"`
	SessionName string `json:"sessionName,omitempty"`
	Cols        uint16 `json:"cols,omitempty"`
	Rows        uint16 `json:"rows,omitempty"`
	Data        string `json:"data,omitempty"`
}

type response struct {
	Type     string `json:"type"`
	StreamID string `json:"streamId,omitempty"`
	Data     string `json:"data,omitempty"`
	Message  string `json:"message,omitempty"`
	ExitCode int    `json:"exitCode,omitempty"`
}

type stream struct {
	id     string
	cmd    *exec.Cmd
	pty    *os.File
	closed bool
	mu     sync.Mutex
}

type client struct {
	conn    net.Conn
	encoder *json.Encoder
	writeMu sync.Mutex
	streams map[string]*stream
}

func newClient(conn net.Conn) *client {
	return &client{
		conn:    conn,
		encoder: json.NewEncoder(conn),
		streams: make(map[string]*stream),
	}
}

func (c *client) send(resp response) {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	if err := c.encoder.Encode(resp); err != nil {
		log.Printf("encode response: %v", err)
	}
}

func (c *client) closeAll() {
	for _, stream := range c.streams {
		stream.close()
	}
}

func (s *stream) close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return
	}
	s.closed = true
	_ = s.pty.Close()
	if s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
	}
}

func (s *stream) write(data []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return errors.New("stream closed")
	}
	_, err := s.pty.Write(data)
	return err
}

func (s *stream) resize(cols, rows uint16) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return errors.New("stream closed")
	}
	return pty.Setsize(s.pty, &pty.Winsize{Cols: cols, Rows: rows})
}

func attachStream(streamID, sessionName, tmuxPath string, cols, rows uint16, c *client) (*stream, error) {
	cmd := exec.Command(tmuxPath, "attach-session", "-t", sessionName)
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: cols, Rows: rows})
	if err != nil {
		return nil, err
	}

	s := &stream{
		id:  streamID,
		cmd: cmd,
		pty: ptmx,
	}

	go func() {
		defer s.close()
		buf := make([]byte, 32*1024)
		for {
			n, readErr := ptmx.Read(buf)
			if n > 0 {
				c.send(response{
					Type:     "output",
					StreamID: streamID,
					Data:     base64.StdEncoding.EncodeToString(buf[:n]),
				})
			}
			if readErr != nil {
				if !errors.Is(readErr, io.EOF) {
					c.send(response{
						Type:     "error",
						StreamID: streamID,
						Message:  readErr.Error(),
					})
				}
				break
			}
		}
	}()

	go func() {
		err := cmd.Wait()
		exitCode := 0
		if err != nil {
			var exitErr *exec.ExitError
			if errors.As(err, &exitErr) {
				exitCode = exitErr.ExitCode()
			} else {
				c.send(response{
					Type:     "error",
					StreamID: streamID,
					Message:  err.Error(),
				})
			}
		}
		c.send(response{
			Type:     "exit",
			StreamID: streamID,
			ExitCode: exitCode,
		})
	}()

	return s, nil
}

func handleClient(conn net.Conn, tmuxPath string) {
	defer conn.Close()

	c := newClient(conn)
	defer c.closeAll()

	scanner := bufio.NewScanner(conn)
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)

	for scanner.Scan() {
		var req request
		if err := json.Unmarshal(scanner.Bytes(), &req); err != nil {
			c.send(response{Type: "error", Message: fmt.Sprintf("invalid request: %v", err)})
			continue
		}

		switch req.Type {
		case "open":
			if req.StreamID == "" || req.SessionName == "" {
				c.send(response{Type: "error", StreamID: req.StreamID, Message: "streamId and sessionName required"})
				continue
			}

			if existing, ok := c.streams[req.StreamID]; ok {
				existing.close()
				delete(c.streams, req.StreamID)
			}

			cols, rows := req.Cols, req.Rows
			if cols == 0 {
				cols = 80
			}
			if rows == 0 {
				rows = 24
			}

			stream, err := attachStream(req.StreamID, req.SessionName, tmuxPath, cols, rows, c)
			if err != nil {
				c.send(response{Type: "error", StreamID: req.StreamID, Message: err.Error()})
				continue
			}

			c.streams[req.StreamID] = stream
			c.send(response{Type: "ready", StreamID: req.StreamID})

		case "write":
			stream, ok := c.streams[req.StreamID]
			if !ok {
				c.send(response{Type: "error", StreamID: req.StreamID, Message: "stream not found"})
				continue
			}

			data, err := base64.StdEncoding.DecodeString(req.Data)
			if err != nil {
				c.send(response{Type: "error", StreamID: req.StreamID, Message: fmt.Sprintf("invalid write payload: %v", err)})
				continue
			}

			if err := stream.write(data); err != nil {
				c.send(response{Type: "error", StreamID: req.StreamID, Message: err.Error()})
			}

		case "resize":
			stream, ok := c.streams[req.StreamID]
			if !ok {
				c.send(response{Type: "error", StreamID: req.StreamID, Message: "stream not found"})
				continue
			}

			if err := stream.resize(req.Cols, req.Rows); err != nil {
				c.send(response{Type: "error", StreamID: req.StreamID, Message: err.Error()})
			}

		case "close":
			stream, ok := c.streams[req.StreamID]
			if ok {
				stream.close()
				delete(c.streams, req.StreamID)
			}

		case "ping":
			c.send(response{Type: "pong"})

		default:
			c.send(response{Type: "error", StreamID: req.StreamID, Message: fmt.Sprintf("unknown request type: %s", req.Type)})
		}
	}

	if err := scanner.Err(); err != nil {
		log.Printf("scanner error: %v", err)
	}
}

func main() {
	socketPath := flag.String("socket", filepath.Join(os.TempDir(), "cloudcode-pty.sock"), "unix socket path")
	tmuxPath := flag.String("tmux", "tmux", "tmux binary path")
	flag.Parse()

	if err := os.RemoveAll(*socketPath); err != nil {
		log.Fatalf("remove stale socket: %v", err)
	}

	listener, err := net.Listen("unix", *socketPath)
	if err != nil {
		log.Fatalf("listen on socket: %v", err)
	}
	defer listener.Close()

	if err := os.Chmod(*socketPath, 0600); err != nil {
		log.Fatalf("chmod socket: %v", err)
	}

	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Printf("accept error: %v", err)
			continue
		}

		go handleClient(conn, *tmuxPath)
	}
}
