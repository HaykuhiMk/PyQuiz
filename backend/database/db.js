const { MongoClient } = require("mongodb");

const mongoURI = "mongodb://localhost:27017"; 
const dbName = "pyquiz";
const collectionName = "questions"; 

async function readQuestions() {
    const client = new MongoClient(mongoURI);

    try {
        await client.connect();
        console.log("✅ Connected to MongoDB!");
        const db = client.db(dbName);
        const questionsCollection = db.collection(collectionName);
        const questions = await questionsCollection.find().toArray();
        return questions;

    } catch (error) {
        console.error("❌ Error reading questions:", error);
        return [];
    } finally {
        await client.close();
        console.log("🔌 Disconnected from MongoDB.");
    }
}

module.exports = { readQuestions };
