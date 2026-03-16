# Shipping CloudCode as a Global CLI

CloudCode is designed to be shipped as a single, global NPM package that includes the backend server, the React frontend, and the Go-based PTY sidecar.

## 1. Prepare the Package
To bundle everything (frontend + backend + sidecar) into the distributable format:

```bash
cd backend
npm run bundle
```
*This command builds the React frontend and copies it into `backend/frontend-dist` so it can be served as static assets by the CLI.*

## 2. Local Installation (For Testing)
To test the global CLI on your own machine without publishing to NPM:

```bash
cd backend
npm install -g .
```

Now you can run `cloudcode` from **any** folder on your machine:
```bash
cloudcode profiles
cloudcode run gemini-cli --rc
```

## 3. Publishing to NPM
To share CloudCode with the world:

1.  **Login to NPM:** `npm login`
2.  **Publish:**
    ```bash
    cd backend
    npm publish
    ```

*Note: Ensure you have built the sidecar binary for the target architectures or use a post-install script to build it from source on the user's machine.*

## 4. How Users Install It
Once published, users only need one command:

```bash
npm install -g cloudcode
```

## 5. Directory Structure (Shipped)
When installed, the package structure looks like this:
- `bin/cloudcode-pty-sidecar` (Go Binary)
- `dist/cli.js` (Main Entry Point)
- `frontend-dist/` (React Static Assets)
- `node_modules/` (Dependencies)
