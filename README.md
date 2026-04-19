
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
# 🚀 AI-Powered PDF to MCQ & Smart Learning System

An advanced AI-driven web application that transforms uploaded documents into **interactive quizzes, summaries, flashcards, and smart notes** with a controlled exam-like experience.

---

## 📌 Overview

This project allows users to upload one or multiple files (PDF/DOCX/TXT) and automatically generates:

- 📚 Chapter-wise topic detection  
- 🧠 MCQ-based quizzes  
- 📝 Summaries  
- 🃏 Flashcards  
- 📖 Smart notes  

It also provides a **real exam environment** with restricted navigation, auto-submit behavior, and controlled scrolling.

---

## ✨ Features

### 📂 Multi-File Support
- Upload single or multiple files  
- Each file is processed independently  
- Topics are detected per file  

---

### 🧩 Topic Detection
- Extracts chapters/topics from each file  
- Maintains order of appearance  
- Displays topics under respective file names  

---

### ⚙️ Quiz Configuration Modes

#### 🔹 Sub Quizzes
- Separate quiz for each uploaded file  

#### 🔹 Combined Quiz
- Single quiz using all uploaded files  

---

### 🧠 MCQ Generator
- Generates questions from document content  
- 4 options per question  
- One correct answer  
- Explanation for each question  
- Supports difficulty levels  

---

### 📊 Quiz Evaluation
- Displays score after submission  
- Correct answers → 🟢 Green  
- Wrong answers → 🔴 Red  
- Shows correct answer + explanation  

---

### 🔒 Full Exam Mode
- User cannot exit freely  
- Exit attempt shows confirmation  
- Confirm → auto-submit  
- Cancel → continue quiz  

---

### 📜 Controlled Scrolling
- Only question section is scrollable  
- Entire screen remains fixed  
- Handles long questions efficiently  

---

### 📝 Summary Generator
- Extracts key points from documents  
- Covers important topics  
- Download & save options  

---

### 🃏 Flashcards
- Quick revision cards  
- Front (question) / Back (answer) format  

---

### 📖 Smart Notes
- Key concepts  
- Important points  
- Structured learning notes  

---

### 📊 History Management
- Save quizzes and summaries  
- Separate sections:
  - Saved Quizzes  
  - Saved Summaries  
- View and delete anytime  

---

### 🔐 Authentication (Firebase)
- Email/Password login  
- Google Sign-In  
- Forgot Password support  
- User-specific data storage  

---

### ☁️ Firebase Integration
- 🔐 Authentication  
- 📊 Firestore Database  
- ☁️ Hosting  
- 🔔 Notifications  

---

### 🤖 AI Integration
- Topic extraction  
- MCQ generation  
- Summarization  
- Smart content processing  

---

## 🏗️ System Architecture
User Uploads Files
↓
Text Extraction
↓
AI Processing (Google AI Studio)
↓
Topic Detection + Quiz Logic
↓
MCQ / Summary Generation
↓
Firebase Storage
↓
Frontend Display (React UI)


---

## 🛠️ Tech Stack

### Frontend
- React.js  
- Tailwind CSS  

### Backend / AI
- Google AI Studio (LLM)  

### Database & Auth
- Firebase (Auth + Firestore)  

### Deployment
- Firebase Hosting / Netlify  

---

## ⚙️ How It Works

1. Upload documents  
2. Extract text from files  
3. Detect topics using AI  
4. Select quiz configuration  
5. Generate MCQs  
6. Attempt quiz  
7. View score & explanations  
8. Save results to history  

---

## 📦 Installation

```bash
git clone https://github.com/your-username/project-name.git
cd project-name
npm install
npm run dev
