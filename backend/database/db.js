const fs = require('fs');
const path = require('path');

const dbFilePath = path.join(__dirname, 'questions.json');

// Function to read the database
function readQuestions() {
    const data = fs.readFileSync(dbFilePath);
    return JSON.parse(data);
}

module.exports = { readQuestions };

