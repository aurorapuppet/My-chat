# Chat App

This project is a simple chat application built using Node.js and Socket.io for real-time communication. It consists of a server-side component that manages WebSocket connections and a client-side component that provides the user interface.

## Project Structure

```
chat-app
├── server
│   ├── server.js        # Main server file
│   └── package.json     # NPM configuration file
├── client
│   ├── index.html       # Main HTML file for the client
│   ├── style.css        # Stylesheet for the client
│   └── script.js        # JavaScript file for client-side logic
└── README.md            # Project documentation
```

## Getting Started

### Prerequisites

- Node.js (version X.X.X or higher)
- npm (Node Package Manager)

### Installation

1. Clone the repository:

   ```
   git clone https://github.com/microsoft/vscode-remote-try-node.git
   cd chat-app
   ```

2. Navigate to the server directory and install the dependencies:

   ```
   cd server
   npm install
   ```

### Running the Application

1. Start the server:

   ```
   node server.js
   ```

2. Open the `client/index.html` file in your web browser to access the chat application.

### Usage

- Users can send and receive messages in real-time.
- The application supports multiple users connecting simultaneously.

### Contributing

Feel free to submit issues or pull requests if you have suggestions or improvements for the project.

### License

This project is licensed under the MIT License.