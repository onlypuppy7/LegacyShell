const express = require('express');
const app = express();

// Middleware to protect the route with a simple password
const checkPassword = (req, res, next) => {
    const auth = { login: 'admin', password: 'yourpassword' }; // Replace with your credentials

    // Parse the Authorization header
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    // Verify login and password match
    if (login && password && login === auth.login && password === auth.password) {
        return next(); // Authorized, proceed to the next middleware
    }

    // Unauthorized response if credentials are incorrect
    res.set('WWW-Authenticate', 'Basic realm="Protected Area"'); // Prompts the browser to show login dialog
    res.status(401).send('Authentication required.'); // Unauthorized
};

// Apply the password protection to a specific route
app.get('/protected', checkPassword, (req, res) => {
    res.send('You have access to the protected content!');
});

// Public route for other requests
app.get('/', (req, res) => {
    res.send('Welcome to the public page.');
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
