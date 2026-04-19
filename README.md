
# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View app here:[ https://69e243fe4f7d832529dfb208--vermillion-lokum-69010c.netlify.app/]

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

🚀 AI-Powered PDF to MCQ & Smart Learning System

An advanced AI-driven web application that transforms uploaded documents into interactive quizzes, summaries, flashcards, and smart notes with a controlled exam-like experience.

📌 Overview

This project allows users to upload one or multiple files (PDF/DOCX/TXT) and automatically generates:

📚 Chapter-wise topic detection
🧠 MCQ-based quizzes
📝 Summaries
🃏 Flashcards
📖 Smart notes

It also provides a real exam environment with restricted navigation, auto-submit behavior, and controlled scrolling.

✨ Key Features
📂 Multi-File Support
Upload single or multiple files
Each file is processed independently
Topics are detected per file
🧩 Intelligent Topic Detection
Extracts chapters/topics from each file
Maintains order of appearance
Displays topics under respective file names
⚙️ Quiz Configuration Modes
🔹 Sub Quizzes
Separate quiz for each uploaded file
🔹 Combined Quiz
Single quiz using all uploaded files
🧠 MCQ Generator
Generates questions based only on document content
4 options per question
One correct answer
Explanation for each question
Supports difficulty levels
📊 Quiz Evaluation System
Displays score after submission
Correct answers → 🟢 Green
Wrong answers → 🔴 Red
Shows correct answer + explanation
🔒 Full Exam Mode (Advanced UX)
User cannot exit freely
Exit attempt → warning popup
Confirm exit → auto submit
Cancel → continue quiz
📜 Controlled Scrolling
Only question section is scrollable
Entire screen remains fixed
Handles long questions properly
📝 Summary Generator
Extracts key points from documents
Covers all important topics
Download & save options
🃏 Flashcards Generator
Converts content into quick revision cards
Front (question) / Back (answer) format
📖 Smart Notes
Key concepts
Important points
Structured learning notes
📊 History Management
Save quizzes and summaries
Separate sections:
Saved Quizzes
Saved Summaries
View and delete anytime
🔐 Authentication (Firebase)
Email/Password login
Google Sign-In
Forgot Password support
User-specific data storage
☁️ Firebase Integration
🔐 Authentication
📊 Firestore Database
☁️ Hosting
🔔 Notifications (FCM)
🤖 Google AI Integration
Topic extraction
MCQ generation
Summarization
Smart content processing
🏗️ System Architecture
User Uploads Files
        ↓
Text Extraction
        ↓
Google AI Processing
        ↓
Topic Detection + Quiz Logic
        ↓
MCQ / Summary Generation
        ↓
Firebase Storage
        ↓
Frontend Display (React UI)
🛠️ Tech Stack
Frontend
React.js
Tailwind CSS
Backend / AI
Google AI Studio (LLM)
Database & Auth
Firebase (Auth + Firestore)
Deployment
Firebase Hosting / Netlify
⚙️ How It Works
Upload one or multiple documents
System extracts text
AI detects topics per file
User selects quiz configuration
MCQs are generated
User attempts quiz
Score + explanations are shown
Data can be saved to history
📦 Installation
git clone https://github.com/your-username/project-name.git
cd project-name
npm install
npm run dev
🔐 Environment Variables

Create .env file:

VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=your_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_GEMINI_API_KEY=your_api_key
🚀 Deployment
npm run build
firebase deploy
⚠️ Limitations
Large PDFs may require chunking
AI response depends on input quality
Internet connection required
🔮 Future Enhancements
🎤 Voice-based quiz
📱 Mobile app version
🧑‍🤝‍🧑 Quiz sharing
🌐 Multi-language support
📊 Performance analytics dashboard
👨‍💻 Author

Bharadwaj & Team
B.Tech CSE Student
AI & Full Stack Enthusiast

⭐ Conclusion

This project is not just a quiz generator — it is a complete AI-based learning platform that combines:

Intelligent content understanding
Dynamic quiz generation
Real exam experience
