const WebSocket = require('ws');
const os = require('os');
const fs = require('fs');
const path = require('path');

let clients = [];
let admin = null;
let currentQuestionIndex = -1;
let questionStartTime = 0;
let scores = {};
let port = 8699;

// Load questions from JSON file with error handling
let quizQuestions = [];
try {
    const data = fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8');
    quizQuestions = JSON.parse(data);
    console.log('Fragen erfolgreich aus der JSON-Datei geladen.');
} catch (error) {
    console.error('Fehler beim Laden der Fragen aus der JSON-Datei:', error.message);
    process.exit(1);
}

// WebSocket-Server
const server = new WebSocket.Server({ port: port });

// If a client connects to the server, save his socket in the clients array
server.on('connection', socket => {
    console.log('Ein Client hat sich verbunden.');
    clients.push(socket);

    // If the client sends a message, parse it and react accordingly
    socket.on('message', message => {
        const parsedMessage = JSON.parse(message);
        // If the message contains a valid username, save it in the scores dictionary
        if (parsedMessage.username !== undefined) {
            scores[parsedMessage.username] = scores[parsedMessage.username] || 0;
            broadcastUserList(); // Broadcast user list whenever a new user logs in
        }
        // If the message is a login message, save the first socket as the admin and send it to the client
        if (parsedMessage.type === 'login') {
            if (!admin) {
                admin = socket;
                socket.send(JSON.stringify({ type: 'admin' }));
            }
        }
        // If the message is a nextQuestionAdmin request, send the next question to the clients
        else if (parsedMessage.type === 'nextQuestion') {
            // Compare if the message is a guess or a normal request
            if (parsedMessage.category === 'guess') {
                broadcast({ type: 'guessclear' }); // Reset the guesses
                sendQuestionToClients();
            } else {
                sendQuestionToClients();
            }
        } else if (parsedMessage.type === 'solution-request' && socket === admin) {
            /* 
        If the message is a solution request by the Admin, send the 
        solution to the clients once by calling the corresponding function
        */
            broadcastAnswerFeedback();
        } else if (parsedMessage.type === 'answer') {
            /* 
        If the message is an answer submission by the client, evaluate 
        the answer and calculate his score by the taken time
        */
            const timeTaken = Date.now() - questionStartTime;
            const correct = evaluateAnswer(parsedMessage.questionIndex, parsedMessage.answer);
            if (correct) {
                // Add points to the user's score based on the time taken to answer, max 1000 points
                scores[parsedMessage.username] =
                    (scores[parsedMessage.username] || 0) + Math.floor(Math.min(1200 - 100 * (timeTaken / 1000), 1000));
            }
        }
        // If the message is a requestTime message, send the time for the current question to the client
        else if (parsedMessage.type === 'requestTime') {
            sendTimeToClient(socket);
        }
    });
    // If a client closes the connection, remove his socket from the clients array
    socket.on('close', () => {
        console.log('Ein Client hat die Verbindung geschlossen.');
        clients = clients.filter(client => client !== socket);
        // If the admin closes the connection, assign the admin role to the next client in the clients array
        if (socket === admin) {
            admin = clients.length > 0 ? clients[0] : null;
            // Message to the new admin
            if (admin) {
                admin.send(JSON.stringify({ type: 'admin' }));
            }
        }
    });
});

// Function to sort the Scores in descending order
function sortScores() {
    let items = Object.entries(scores);
    items.sort((a, b) => b[1] - a[1]);
    let sortedDictionary = {};
    items.forEach(([key, value]) => {
        sortedDictionary[key] = value;
    });
    return sortedDictionary;
}

// Function to evaluate the answer of the client
function evaluateAnswer(questionIndex, answer) {
    /* 
    Check if the correct answer is a number, so we can check if the answer is 
    within the given tolerance, else iterate over the correct answers in the second case
    */
    if (typeof quizQuestions[questionIndex].correctAnswer === 'number') {
        if (
            answer >= quizQuestions[questionIndex].correctAnswer - quizQuestions[questionIndex].tolerance &&
            answer <= quizQuestions[questionIndex].correctAnswer + quizQuestions[questionIndex].tolerance
        ) {
            return true;
        } else {
            return false;
        }
    }

    for (let i in quizQuestions[questionIndex].correctAnswer) {
        if (answer === quizQuestions[questionIndex].correctAnswer[i]) {
            return true;
        }
    }
    return false;
}

// Function to broadcast the next question to the clients
function sendQuestionToClients() {
    currentQuestionIndex++;
    // If we have reached the end of the questions or the index is invalid, broadcast the results
    if (currentQuestionIndex < 0 || currentQuestionIndex >= quizQuestions.length) {
        broadcastResults();
    }
    // Else broadcast the next valid question
    else {
        const question = quizQuestions[currentQuestionIndex];
        questionStartTime = Date.now();
        broadcast({
            type: 'question',
            data: { ...question, index: currentQuestionIndex },
            timestamp: questionStartTime,
        });
    }
}

// Send the given time for the current question to the client
function sendTimeToClient(socket) {
    const time = 10;
    socket.send(JSON.stringify({ type: 'time', timeLeft: time }));
}

/* 
Function to broadcast the answer feedback to the clients, 
by sending the correct answer and the calculated scores
*/
function broadcastAnswerFeedback() {
    const correctAnswer = quizQuestions[currentQuestionIndex].correctAnswer;
    broadcast({
        type: 'answerFeedback',
        correctAnswer: correctAnswer,
        scores: scores,
        tolerance: quizQuestions[currentQuestionIndex].tolerance,
    });
}

// Broadcast function to send a message to all connected clients
function broadcast(message) {
    const messageString = JSON.stringify(message);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(messageString);
        }
    });
}

// Function to broadcast the results to the clients, if the quiz has ended
function broadcastResults() {
    scores = sortScores();
    const resultsMessage = JSON.stringify({ type: 'results', scores: scores });
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(resultsMessage);
        }
    });
}

// Function to broadcast the user list to the clients in the waiting room
function broadcastUserList() {
    let users = Object.keys(scores);
    broadcast({ type: 'userList', users: users });
}

// Dynamic IP Address and Port output
const interfaces = os.networkInterfaces();
for (let interfaceName in interfaces) {
    interfaces[interfaceName].forEach(iface => {
        if (iface.family === 'IPv4' && !iface.internal) {
            console.log(`WebSocket-Server läuft auf ${iface.address}:${port}`);
        }
    });
}
