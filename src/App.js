import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [surveys, setSurveys] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newSurveyTitle, setNewSurveyTitle] = useState('');

  // Load surveys from local storage on mount
  useEffect(() => {
    const storedSurveys = JSON.parse(localStorage.getItem('surveys')) || [];
    setSurveys(storedSurveys);
  }, []);

  // Save surveys to local storage whenever they change
  useEffect(() => {
    localStorage.setItem('surveys', JSON.stringify(surveys));
  }, [surveys]);

  const handleCreateSurvey = (e) => {
    e.preventDefault();
    if (newSurveyTitle) {
      const newSurvey = { id: Date.now(), title: newSurveyTitle };
      setSurveys([...surveys, newSurvey]);
      setNewSurveyTitle('');
      setIsModalOpen(false);
    }
  };

  const handleDeleteSurvey = (id) => {
    if (window.confirm('Are you sure you want to delete this survey?')) {
      setSurveys(surveys.filter(survey => survey.id !== id));
    }
  };

  return (
    <div className="app">
      <header>
        <h1>Survey App</h1>
      </header>
      <div className="survey-list">
        {surveys.map(survey => (
          <div key={survey.id} className="survey-item">
            <span>{survey.title}</span>
            <button onClick={() => handleDeleteSurvey(survey.id)}>Delete</button>
          </div>
        ))}
      </div>
      <button className="create-btn" onClick={() => setIsModalOpen(true)}>
        Create New Survey
      </button>

      {isModalOpen && (
        <div className="modal">
          <div className="modal-content">
            <span className="close" onClick={() => setIsModalOpen(false)}>×</span>
            <form onSubmit={handleCreateSurvey}>
              <label htmlFor="survey-title">Survey Title:</label>
              <input
                type="text"
                id="survey-title"
                value={newSurveyTitle}
                onChange={(e) => setNewSurveyTitle(e.target.value)}
              />
              <button type="submit">Create</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;