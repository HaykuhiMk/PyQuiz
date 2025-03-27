const { MongoClient } = require("mongodb");

const mongoURI = process.env.MONGO_URI || "mongodb://localhost:27017";
const dbName = "pyquiz";
const collectionName = "questions";

async function fetchQuestionsFromDB() {
    const client = new MongoClient(mongoURI);
    try {
        await client.connect();
        const db = client.db(dbName);
        const questionsCollection = db.collection(collectionName);
        return await questionsCollection.find().toArray();
    } catch (error) {
        console.error("❌ Error fetching questions:", error);
        return [];
    } finally {
        await client.close();
    }
}

async function addQuestionToDB(questionData) {
    const client = new MongoClient(mongoURI);
    try {
        await client.connect();
        const db = client.db(dbName);
        const questionsCollection = db.collection(collectionName);
        await questionsCollection.insertOne(questionData);
        return { success: true, message: "Question added successfully!" };
    } catch (error) {
        console.error("❌ Error adding question:", error);
        return { success: false, message: "Failed to add question." };
    } finally {
        await client.close();
    }
}

async function addQuestion(req, res) {
    const questionData = req.body;
    console.log("Received data:", req.body); 

    if (!questionData.question || !questionData.options || !questionData.answer) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    
    const result = await addQuestionToDB(questionData);
    if (result.success) {
        res.status(201).json({ message: result.message });
    } else {
        res.status(500).json({ error: result.message });
    }
}

async function getAllQuestions(req, res) {
    const questions = await fetchQuestionsFromDB();
    res.json(questions);
}

async function getRandomQuestion(req, res) {
    const questions = await fetchQuestionsFromDB();
    if (questions.length === 0) {
        return res.status(404).json({ error: "No questions found" });
    }
    const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
    res.json(randomQuestion);
}

module.exports = { getAllQuestions, getRandomQuestion, addQuestion };
