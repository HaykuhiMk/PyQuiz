# 🧠 PyQuiz
PyQuiz is a fun, interactive web application designed to help users test and enhance their Python skills through various quizzes and challenges. Built with a modern tech stack and a clean user experience, PyQuiz is perfect for beginners who want to learn, as well as experienced developers who want to sharpen their knowledge.

📡 Live Project
Try out the live version here:

🌍 [PyQuiz](https://pyquiz.picsartacademy.am/)

✍️ Blog Post
Learn more about the journey and features of PyQuiz in this detailed article:

👉 [Exploring PyQuiz – A Fun and Interactive Way to Test Your Python Skills](https://medium.com/@haykuhimkrtchyan09/exploring-pyquiz-a-fun-and-interactive-way-to-test-your-python-skills-c62cecd2f37c)


## 🚀 Features

**🧪 Interactive Python Quizzes** – Timed, auto-evaluated questions to test your Python knowledge

**👥 User Authentication** – Secure login/signup using JWT tokens

**🗂 Multiple Difficulty Levels** – Ranging from beginner to advanced

**📊 Score Tracking** – Keeps track of your results and improvements

**🛠 Admin Panel** – Easily manage questions and users

**🌐 RESTful API** – Backend services exposed for quiz data and authentication


## 🛠 Tech Stack
### Frontend

* HTML/CSS/JavaScript
* EJS Templates (for server-side rendering)

### Backend

* Node.js
* Express.js
* MongoDB (Mongoose ODM)
* JSON Web Tokens (JWT) for authentication

## 🔐 Authentication
* Users sign up/login with a secure JWT-based flow.
* JWT tokens are used to maintain sessions and authorize access to protected routes.

## 📦 Installation & Setup for Developers
**Clone the repository:**
```
git clone https://github.com/HaykuhiMk/PyQuiz.git
cd PyQuiz
```

**Install dependencies:**

`npm install`

**Add your .env file for environment configs:**
```
PORT=3000
MONGO_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
```

**Start the server:**

`npm start`

**Visit [http://localhost:3000](http://localhost:3000) in your browser.**

## 🙌 Contributing
Contributions are welcome! If you have ideas for new features or improvements, feel free to open an issue or submit a PR.

## 📃 License
This project is licensed under the MIT License. See the LICENSE file for details.





