const { MongoClient } = require("mongodb");
const fs = require("fs");

const mongoURI = "mongodb://localhost:27017";
const dbName = "pyquiz";
const collectionName = "questions";

async function insertQuestions() {
    const client = new MongoClient(mongoURI);

    try {
        await client.connect();
        const db = client.db(dbName);
        const questionsCollection = db.collection(collectionName);
        const questionsData = JSON.parse(fs.readFileSync("questions.json", "utf-8"));
        const transformedQuestions = questionsData.map(q => ({
            id: q.id,
            question: q.question,
            code: q.code || "", 
            options: q.options,
            answer: q.answer,
            difficulty: q.difficulty || "medium", 
            topics: q.topics || [], 
            explanation: q.explanation || "No explanation provided."
        }));
        await questionsCollection.insertMany(transformedQuestions);
    } catch (error) {
        console.error("❌ Error inserting questions:", error);
    } finally {
        await client.close();
    }
}
insertQuestions();
