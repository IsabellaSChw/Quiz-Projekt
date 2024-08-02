let socket;
let username;
let isAdmin = false;
let timer;
let checkingDic = {};
let timerswitch = -1;

document.addEventListener('DOMContentLoaded', () => {
    // Load the login form if the DOM content is loaded
    const loginForm = document.getElementById('login-form');
    loginForm.addEventListener('submit', function (event) {
        // Event listener for submitting the login form
        event.preventDefault();
        username = String(document.getElementById('username').value);
        localStorage.setItem('username', username);
        showPage('waiting-page');
        connectToServer();
    });

    // Start the quiz, if the user is the admin and the button is clicked, send a type message to the server
    document.getElementById('start-quiz-btn').addEventListener('click', function () {
        if (isAdmin) {
            socket.send(JSON.stringify({ type: 'nextQuestion' }));
        }
    });

    // Next question button for the admin, splitted into two buttons for the two different question types
    document.getElementById('c-next-question-btn').addEventListener('click', function () {
        if (isAdmin) {
            socket.send(JSON.stringify({ type: 'nextQuestion' }));
        }
    });

    document.getElementById('g-next-question-btn').addEventListener('click', function () {
        if (isAdmin) {
            socket.send(
                JSON.stringify({
                    type: 'nextQuestion',
                    category: 'guess',
                })
            );
        }
    });

    // Return to the login page as a user
    document.getElementById('return').addEventListener('click', function () {
        showPage('login-page');
        socket.close();
    });
});

/* 
Function to show the different pages by adding the 'hidden' HTML class 
to all pages and removing it from the desired page
*/
function showPage(pageId) {
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('waiting-page').classList.add('hidden');
    document.getElementById('choice').classList.add('hidden');
    document.getElementById('guess').classList.add('hidden');
    document.getElementById('results-page').classList.add('hidden');
    document.getElementById(pageId).classList.remove('hidden');

    // Hide the next question button if the user is not the admin, again, two buttons for the two question types
    if (isAdmin && pageId === 'choice') {
        document.getElementById('c-next-question-btn').classList.remove('hidden');
        document.getElementById('c-next-question-btn').disabled = true;
        document.getElementById('c-next-question-btn').innerHTML = 'Skip noch nicht möglich...';
    } else {
        document.getElementById('c-next-question-btn').classList.add('hidden');
    }

    if (isAdmin && pageId === 'guess') {
        document.getElementById('g-next-question-btn').classList.remove('hidden');
        document.getElementById('g-next-question-btn').disabled = true;
        document.getElementById('g-next-question-btn').innerHTML = 'Skip noch nicht möglich...';
    } else {
        document.getElementById('g-next-question-btn').classList.add('hidden');
    }
}

// Function to connect to the server via WebSocket, IP address has to be changed to the server's IP
function connectToServer() {
    socket = new WebSocket('ws://192.168.178.155:8699');

    // If the connection is possible, send a login message to the server and change the status text
    socket.addEventListener('open', function () {
        document.getElementById('status').textContent = 'Verbindung zum Server hergestellt.';
        socket.send(JSON.stringify({ type: 'login', username: username }));
    });

    // If the connection is closed, change the status text
    socket.addEventListener('close', function () {
        document.getElementById('status').textContent = 'Verbindung zum Server geschlossen.';
    });

    // Event listener for incoming messages from the server
    socket.addEventListener('message', function (event) {
        const messageData = JSON.parse(event.data);

        // The first user to connect is the admin, gets a confirmation message and the start quiz button
        if (messageData.type === 'admin') {
            isAdmin = true;
            document.getElementById('status').textContent = 'Sie sind der Admin. Klicken Sie auf "Quiz Starten", um zu beginnen.';
            document.getElementById('start-quiz-btn').classList.remove('hidden');
        }
        // If the message is a question, show the corresponding question page and display the question, depending on the category
        else if (messageData.type === 'question') {
            if (messageData.data.category !== 'guess') {
                showPage('choice');
                timerswitch = 0; // timer switch is being used to determine which timer to update
            } else {
                showPage('guess');
                timerswitch = 1;
            }
            displayQuestion(messageData.data);
        }
        // If the message is a time message, update the timer for every user, by calling the updateTimer function
        else if (messageData.type === 'time') {
            updateTimer(messageData.timeLeft);
        }
        // If the message is a results message, show the results page by calling the showResults function
        else if (messageData.type === 'results') {
            showResults(messageData.scores);
        }
        // If the message is a feedback message, display the feedback by calling the displayAnswerFeedback function
        else if (messageData.type === 'answerFeedback') {
            displayAnswerFeedback(messageData.correctAnswer, messageData.tolerance, messageData.scores);
        }
        // If the message is a user list message, update the user list by calling the updateUserList function
        else if (messageData.type === 'userList') {
            updateUserList(messageData.users);
        }
        // If the message is a guessclear message, clear the guess input by calling the clearguess function
        else if (messageData.type === 'guessclear') {
            clearguess();
        }
    });
}

// Function to display the question, depending on the category
function displayQuestion(questionData) {
    // If the category is not guess, display the questions by iterating through the answers and creating buttons for them
    if (questionData.category !== 'guess') {
        const questionText = document.getElementById('question');
        const answerList = document.getElementById('answers');

        questionText.textContent = questionData.question;
        answerList.innerHTML = '';

        questionData.answers.forEach((answer, index) => {
            const answerItem = document.createElement('button');
            answerItem.textContent = answer;
            answerItem.classList.add('list-group-item', 'list-group-item-action');
            answerItem.onclick = () => checkAnswer(index, questionData.index, answerItem);
            answerList.appendChild(answerItem);
        });
    } else {
        /* 
    Else the category is guess, display the question by setting the text content of the guess question element and 
    add an event listener to the confirm button for submitting the guess
    */
        const questionText = document.getElementById('guess-question');
        questionText.textContent = questionData.question;
        const confirmer = document.getElementById('confirm-button');
        confirmer.onclick = () =>
            checkAnswer(document.getElementById('guess-input').value, questionData.index, confirmer);
    }
    socket.send(JSON.stringify({ type: 'requestTime' })); //Request the time from the server
}

// Function to update the timer, by clearing the old interval and setting a new one
function updateTimer(timeLeft) {
    clearInterval(timer);
    // Update the timer element depending on the timer switch
    if (timerswitch === 0) {
        timerElement = document.getElementById('choice-timer');
    } else if (timerswitch === 1) {
        timerElement = document.getElementById('guess-timer');
    }

    // Show the time left immediately
    timerElement.textContent = `Zeit übrig: ${timeLeft}s`;

    // Function to update the timer every second
    timer = setInterval(() => {
        timeLeft--;
        timerElement.textContent = `Zeit übrig: ${timeLeft}s`;
        // If the time is up, clear the interval, send a solution request to the server and lock the inputs
        if (timeLeft <= 0) {
            clearInterval(timer);
            socket.send(JSON.stringify({ type: 'solution-request' }));
            lockAnswers();
            // Unlock the skip button if the user is the admin
            if (isAdmin) {
                document.getElementById('c-next-question-btn').disabled = false;
                document.getElementById('g-next-question-btn').disabled = false;
                document.getElementById('c-next-question-btn').innerHTML = 'Nächste Seite anzeigen';
                document.getElementById('g-next-question-btn').innerHTML = 'Nächste Seite anzeigen';
            }
        }
    }, 1000); // In milliseconds
}

// Function to clear the guess input and the confirm button for the next possible guess, working with HTML classes
function clearguess() {
    document.getElementById('confirm-button').classList.remove('answer-selected');
    document.getElementById('confirm-button').classList.remove('answer-locked');
    document.getElementById('confirm-button').classList.remove('correct-answer');
    document.getElementById('confirm-button').classList.remove('wrong-answer');
    document.getElementById('confirm-button').innerHTML = 'Confirm';
    document.getElementById('guess-input').classList.remove('answer-locked');
    document.getElementById('guess-input').value = '';
}

/* 
Function to check if the question has already been answered 
to avoid multiple server requests with a simple dictionary
*/
function alrClicked(q) {
    if (q in checkingDic) {
        return false;
    }
    checkingDic[q] = 1;
    return true;
}

/*
If the user has answered, send his try to the server, but 
only if the question hasn't been already answered
*/
function checkAnswer(selectedIndex, questionIndex, answerItem) {
    if (alrClicked(questionIndex)) {
        socket.send(
            JSON.stringify({
                type: 'answer',
                username: username,
                questionIndex: questionIndex,
                answer: selectedIndex,
            })
        );
        lockAnswers(answerItem);
    }
}

// Function to lock the answer-inputs by adding HTML classes, which will change the appearance
function lockAnswers(selectedAnswerItem) {
    // Compare if it is a guess question or a choice question and disable the inputs
    if (selectedAnswerItem === document.getElementById('confirm-button')) {
        document.getElementById('confirm-button').classList.add('answer-locked', 'answer-selected');
        document.getElementById('confirm-button').innerHTML = 'Confirmed';
        document.getElementById('guess-input').classList.add('answer-locked');
    } else if (timerswitch === 1) {
        document.getElementById('guess-input').classList.add('answer-locked');
        document.getElementById('confirm-button').classList.add('answer-locked');
    } else {
        const answerList = document.getElementById('answers');
        answerList.childNodes.forEach(item => {
            item.classList.add('answer-locked');
        });
        if (selectedAnswerItem) {
            selectedAnswerItem.classList.add('answer-selected');
        }
    }
}

/* 
Function to display the correct answers, by adding HTML classes 
and Icons which will visualize the correct and wrong answers. 
Furthermore it will display the points and the rank of the user
*/
function displayAnswerFeedback(correctAnswer, tolerance, scores) {
    // Compare if it is a guess question or a choice question
    if (typeof correctAnswer === 'number') {
        if (
            document.getElementById('guess-input').value >= correctAnswer - tolerance &&
            document.getElementById('guess-input').value <= correctAnswer + tolerance
        ) {
            document.getElementById('confirm-button').classList.add('correct-answer');
            document.getElementById('confirm-button').innerHTML = '✔';
        } else {
            document.getElementById('confirm-button').classList.add('wrong-answer');
            document.getElementById('confirm-button').innerHTML = '✘';
        }
    } else {
        const answerList = document.getElementById('answers');

        answerList.childNodes.forEach(item => {
            item.classList.remove('answer-selected');
            item.classList.remove('list-group-item-success');
            item.classList.remove('list-group-item-danger');
        });

        answerList.childNodes.forEach((answerItem, index) => {
            for (let i = 0; i < correctAnswer.length; i++) {
                if (index === correctAnswer[i]) {
                    answerItem.classList.add('list-group-item-success');
                    answerItem.innerHTML += ' ✔';
                }
            }
            if (!answerItem.innerHTML.includes(' ✔')) {
                answerItem.classList.add('list-group-item-danger');
                answerItem.innerHTML += ' ✘';
            }
        });
    }

    // Update the points and the rank of the user
    const resultText = `Punkte: ${scores[username]} | Platz: ${calculateRank(scores, username)}`;
    if (timerswitch === 0) {
        const timerElement = document.getElementById('choice-timer');
        timerElement.innerHTML = resultText;
    } else if (timerswitch === 1) {
        const timerElement = document.getElementById('guess-timer');
        timerElement.innerHTML = resultText;
    }
}

// Function to calculate the rank of the user by comparing the scores
function calculateRank(scores, username) {
    const sortedScores = Object.values(scores).sort((a, b) => b - a);
    const userScore = scores[username];
    return sortedScores.indexOf(userScore) + 1;
}

// Function to update the user list by creating rows for each user at the waiting page
function updateUserList(users) {
    const userList = document.getElementById('user-list');
    userList.innerHTML = '';
    users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${user}</td>`;
        userList.appendChild(row);
    });
}

// Function to show the results by creating rows for the top 5 users and navigating to the results page
function showResults(scores) {
    const resultsTableBody = document.querySelector('#results-page tbody');
    resultsTableBody.innerHTML = ''; // Clear existing rows

    let rank = 1;
    let count = 0;
    for (const user in scores) {
        if (count >= 5) {
            break;
        }
        const row = document.createElement('tr');
        let medal = '';
        if (rank === 1) medal = '🥇';
        else if (rank === 2) medal = '🥈';
        else if (rank === 3) medal = '🥉';

        row.innerHTML = `
            <td>${medal} ${rank}. Platz</td>
            <td>${user}</td>
            <td>${scores[user]}</td>
        `;
        resultsTableBody.appendChild(row);
        rank++;
        count++;
    }
    showPage('results-page');
}
