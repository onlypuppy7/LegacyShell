const express = require('express');
const app = express();

// Middleware to protect the route with a simple password


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
