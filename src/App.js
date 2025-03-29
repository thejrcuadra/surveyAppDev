import React, { useState } from 'react';
import './App.css';
import { Dexie } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';

// Initialize Dexie database
const db = new Dexie('surveyApp');
db.version(1).stores({
  surveys: '++id, title',
  respondents: '++id, name, email, surveyId',
  questions: '++id, text, surveyId, responses',
});

const { surveys, respondents, questions } = db;

function App() {
  const allSurveys = useLiveQuery(() => surveys.toArray(), []) || [];
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isResponseModalOpen, setIsResponseModalOpen] = useState(false);
  const [isAddQuestionPopupOpen, setIsAddQuestionPopupOpen] = useState(false); // New state for popup
  const [newSurveyTitle, setNewSurveyTitle] = useState('');
  const [newRespondentName, setNewRespondentName] = useState('');
  const [newRespondentEmail, setNewRespondentEmail] = useState('');
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionInput, setNewQuestionInput] = useState(''); // New state for popup input
  const [tempRespondents, setTempRespondents] = useState([]);
  const [tempQuestions, setTempQuestions] = useState([]);
  const [selectedSurvey, setSelectedSurvey] = useState(null);
  const [responseAnswers, setResponseAnswers] = useState({});
  const [selectedRespondentId, setSelectedRespondentId] = useState('');
  const [customRespondentName, setCustomRespondentName] = useState('');
  const [customRespondentEmail, setCustomRespondentEmail] = useState('');
  const [showCustomFields, setShowCustomFields] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleAddRespondent = () => {
    if (newRespondentName && newRespondentEmail) {
      setTempRespondents([
        ...tempRespondents,
        { id: Date.now(), name: newRespondentName, email: newRespondentEmail },
      ]);
      setNewRespondentName('');
      setNewRespondentEmail('');
    }
  };

  const handleAddQuestion = () => {
    if (newQuestionText) {
      setTempQuestions([
        ...tempQuestions,
        { id: Date.now(), text: newQuestionText, responses: [] },
      ]);
      setNewQuestionText('');
    }
  };

  const handleCreateSurvey = async (e) => {
    e.preventDefault();
    if (newSurveyTitle && tempRespondents.length > 0 && tempQuestions.length > 0) {
      const surveyId = await surveys.add({
        title: newSurveyTitle,
      });

      const respondentPromises = tempRespondents.map(respondent =>
        respondents.add({
          name: respondent.name,
          email: respondent.email,
          surveyId,
        })
      );
      await Promise.all(respondentPromises);

      const questionPromises = tempQuestions.map(question =>
        questions.add({
          text: question.text,
          surveyId,
          responses: [],
        })
      );
      await Promise.all(questionPromises);

      setNewSurveyTitle('');
      setTempRespondents([]);
      setTempQuestions([]);
      setIsModalOpen(false);
    } else {
      alert('Please provide a title, at least one respondent, and one question.');
    }
  };

  const handleDeleteSurvey = async (id) => {
    if (window.confirm('Are you sure you want to delete this survey?')) {
      await surveys.delete(id);
      await respondents.where('surveyId').equals(id).delete();
      await questions.where('surveyId').equals(id).delete();
    }
  };

  const handleViewSurvey = async (survey) => {
    const surveyRespondents = await respondents.where('surveyId').equals(survey.id).toArray();
    const surveyQuestions = await questions.where('surveyId').equals(survey.id).toArray();
    setSelectedSurvey({ ...survey, respondents: surveyRespondents, questions: surveyQuestions });
    setIsViewModalOpen(true);
  };

  const handleDeleteRespondent = async (respondentId) => {
    if (window.confirm('Are you sure you want to delete this respondent?')) {
      await respondents.delete(respondentId);
      const updatedQuestions = selectedSurvey.questions.map(question => {
        const updatedResponses = question.responses.filter(
          response => response.respondentId !== respondentId
        );
        return { ...question, responses: updatedResponses };
      });
      const updatePromises = updatedQuestions.map(question =>
        questions.update(question.id, { responses: question.responses })
      );
      await Promise.all(updatePromises);
      setSelectedSurvey({
        ...selectedSurvey,
        respondents: selectedSurvey.respondents.filter(r => r.id !== respondentId),
        questions: updatedQuestions,
      });
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (window.confirm('Are you sure you want to delete this question?')) {
      await questions.delete(questionId);
      setSelectedSurvey({
        ...selectedSurvey,
        questions: selectedSurvey.questions.filter(q => q.id !== questionId),
      });
    }
  };

  const handleAddNewQuestion = async () => {
    if (newQuestionInput.trim()) {
      const newQuestion = {
        text: newQuestionInput,
        surveyId: selectedSurvey.id,
        responses: [],
      };
      const questionId = await questions.add(newQuestion);
      setSelectedSurvey({
        ...selectedSurvey,
        questions: [...selectedSurvey.questions, { ...newQuestion, id: questionId }],
      });
      setNewQuestionInput('');
      setIsAddQuestionPopupOpen(false);
    } else {
      alert('Please enter a question.');
    }
  };

  const handleSubmitResponse = async (survey) => {
    const surveyRespondents = await respondents.where('surveyId').equals(survey.id).toArray();
    const surveyQuestions = await questions.where('surveyId').equals(survey.id).toArray();
    setSelectedSurvey({ ...survey, respondents: surveyRespondents, questions: surveyQuestions });
    setResponseAnswers({});
    setSelectedRespondentId('');
    setShowCustomFields(false);
    setCustomRespondentName('');
    setCustomRespondentEmail('');
    setErrorMessage('');
    setIsResponseModalOpen(true);
  };

  const handleResponseChange = (questionId, answer) => {
    setResponseAnswers({ ...responseAnswers, [questionId]: answer });
  };

  const handleRespondentSelect = (e) => {
    const value = e.target.value;
    if (value === 'custom') {
      setShowCustomFields(true);
      setSelectedRespondentId('');
    } else {
      setShowCustomFields(false);
      setSelectedRespondentId(value);
      setCustomRespondentName('');
      setCustomRespondentEmail('');
    }
    setErrorMessage('');
  };

  const handleSubmitResponses = async (e) => {
    e.preventDefault();
    let respondentId = selectedRespondentId;

    if (showCustomFields) {
      if (!customRespondentName || !customRespondentEmail) {
        setErrorMessage('Please provide both name and email for the new respondent');
        return;
      }
      respondentId = await respondents.add({
        name: customRespondentName,
        email: customRespondentEmail,
        surveyId: selectedSurvey.id,
      });
      setSelectedSurvey({
        ...selectedSurvey,
        respondents: [
          ...selectedSurvey.respondents,
          { id: respondentId, name: customRespondentName, email: customRespondentEmail, surveyId: selectedSurvey.id }
        ]
      });
    } else if (!respondentId) {
      setErrorMessage('Please select a respondent or add a new one');
      return;
    }

    const updatedQuestions = selectedSurvey.questions.map(question => {
      if (responseAnswers[question.id]) {
        return {
          ...question,
          responses: [
            ...question.responses,
            { 
              respondentId: parseInt(respondentId), 
              answer: responseAnswers[question.id],
              timestamp: Date.now()
            },
          ],
        };
      }
      return question;
    });

    const updatePromises = updatedQuestions.map(question =>
      questions.update(question.id, { responses: question.responses })
    );
    await Promise.all(updatePromises);

    setIsResponseModalOpen(false);
    setResponseAnswers({});
    setSelectedRespondentId('');
    setShowCustomFields(false);
    setCustomRespondentName('');
    setCustomRespondentEmail('');
    setErrorMessage('');
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Surveys!</h1>
      </header>
      <main className="survey-container">
        {allSurveys.length === 0 ? (
          <p className="no-surveys">No surveys yet. Create one to get started!</p>
        ) : (
          <ul className="survey-list">
            {allSurveys.map(survey => (
              <motion.li
                key={survey.id}
                className="survey-item"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <span>{survey.title}</span>
                <div>
                  <button className="view-btn" onClick={() => handleViewSurvey(survey)}>
                    View
                  </button>
                  <button className="respond-btn" onClick={() => handleSubmitResponse(survey)}>
                    Respond
                  </button>
                  <button
                    className="delete-btn"
                    onClick={() => handleDeleteSurvey(survey.id)}
                  >
                    Delete
                  </button>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </main>
      <button className="create-btn" onClick={() => setIsModalOpen(true)}>
        + New Survey
      </button>

      {/* Create Survey Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <button className="close-btn" onClick={() => setIsModalOpen(false)}>
              ×
            </button>
            <form onSubmit={handleCreateSurvey}>
              <div className="form-group">
                <label htmlFor="survey-title">Survey Title</label>
                <input
                  type="text"
                  id="survey-title"
                  value={newSurveyTitle}
                  onChange={(e) => setNewSurveyTitle(e.target.value)}
                  placeholder="Enter survey title"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>Respondents</label>
                <div className="respondent-input">
                  <input
                    type="text"
                    placeholder="Name"
                    value={newRespondentName}
                    onChange={(e) => setNewRespondentName(e.target.value)}
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={newRespondentEmail}
                    onChange={(e) => setNewRespondentEmail(e.target.value)}
                  />
                  <button type="button" className="add-btn" onClick={handleAddRespondent}>
                    Add
                  </button>
                </div>
                <ul className="respondent-list">
                  {tempRespondents.map(respondent => (
                    <li key={respondent.id}>
                      {respondent.name} ({respondent.email})
                    </li>
                  ))}
                </ul>
              </div>

              <div className="form-group">
                <label>Questions</label>
                <div className="question-input">
                  <input
                    type="text"
                    placeholder="Enter question"
                    value={newQuestionText}
                    onChange={(e) => setNewQuestionText(e.target.value)}
                  />
                  <button type="button" className="add-btn" onClick={handleAddQuestion}>
                    Add
                  </button>
                </div>
                <ul className="question-list">
                  {tempQuestions.map(question => (
                    <li key={question.id}>{question.text}</li>
                  ))}
                </ul>
              </div>

              <button type="submit" className="submit-btn">
                Create
              </button>
            </form>
          </div>
        </div>
      )}

      {/* View Survey Modal */}
      {isViewModalOpen && selectedSurvey && (
        <div className="modal-overlay">
          <div className="modal">
            <button className="close-btn" onClick={() => setIsViewModalOpen(false)}>
              ×
            </button>
            <h2>{selectedSurvey.title}</h2>
            <h3>Respondents</h3>
            <ul>
              {selectedSurvey.respondents.map(respondent => (
                <motion.li
                  key={respondent.id}
                  className="respondent-item"
                  initial={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <span>{respondent.name} ({respondent.email})</span>
                  <button
                    className="delete-item-btn"
                    onClick={() => handleDeleteRespondent(respondent.id)}
                    title="Delete respondent"
                  >
                    🗑️
                  </button>
                </motion.li>
              ))}
            </ul>
            <h3>Questions and Responses</h3>
            {selectedSurvey.questions.map(question => (
              <motion.div
                key={question.id}
                className="question-responses"
                initial={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="question-header">
                  <p><strong>{question.text}</strong></p>
                  <button
                    className="delete-item-btn"
                    onClick={() => handleDeleteQuestion(question.id)}
                    title="Delete question"
                  >
                    🗑️
                  </button>
                </div>
                {question.responses.length > 0 ? (
                  <ul>
                    {question.responses.map((response, idx) => {
                      const respondent = selectedSurvey.respondents.find(r => r.id === response.respondentId);
                      return (
                        <li key={idx}>
                          {respondent ? `${respondent.name}: ` : 'Unknown respondent: '}
                          {response.answer}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p>No responses yet.</p>
                )}
              </motion.div>
            ))}
            <button
              className="add-question-btn"
              onClick={() => setIsAddQuestionPopupOpen(true)}
            >
              + Add Question
            </button>

            {/* Add Question Popup */}
            {isAddQuestionPopupOpen && (
              <div className="popup-overlay">
                <motion.div
                  className="popup"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <button
                    className="close-btn"
                    onClick={() => setIsAddQuestionPopupOpen(false)}
                  >
                    ×
                  </button>
                  <h3>Add New Question</h3>
                  <input
                    type="text"
                    value={newQuestionInput}
                    onChange={(e) => setNewQuestionInput(e.target.value)}
                    placeholder="Enter your question"
                    autoFocus
                  />
                  <button className="submit-btn" onClick={handleAddNewQuestion}>
                    Save
                  </button>
                </motion.div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Submit Response Modal */}
      {isResponseModalOpen && selectedSurvey && (
        <div className="modal-overlay">
          <div className="modal">
            <button className="close-btn" onClick={() => setIsResponseModalOpen(false)}>
              ×
            </button>
            <h2>Respond to: {selectedSurvey.title}</h2>
            <form onSubmit={handleSubmitResponses}>
              <label htmlFor="respondent-select">Select Respondent</label>
              <select
                id="respondent-select"
                value={selectedRespondentId}
                onChange={handleRespondentSelect}
              >
                <option value="">-- Select Respondent --</option>
                {selectedSurvey.respondents.map(respondent => (
                  <option key={respondent.id} value={respondent.id}>
                    {respondent.name} ({respondent.email})
                  </option>
                ))}
                <option value="custom">Add New Respondent</option>
              </select>

              {showCustomFields && (
                <div className="custom-respondent-input">
                  <input
                    type="text"
                    placeholder="New Respondent Name"
                    value={customRespondentName}
                    onChange={(e) => setCustomRespondentName(e.target.value)}
                    required={showCustomFields}
                  />
                  <input
                    type="email"
                    placeholder="New Respondent Email"
                    value={customRespondentEmail}
                    onChange={(e) => setCustomRespondentEmail(e.target.value)}
                    required={showCustomFields}
                  />
                </div>
              )}
              
              {errorMessage && (
                <p className="error-message">{errorMessage}</p>
              )}
              
              {selectedSurvey.questions.map(question => (
                <div key={question.id} className="response-input">
                  <label>{question.text}</label>
                  <input
                    type="text"
                    value={responseAnswers[question.id] || ''}
                    onChange={(e) => handleResponseChange(question.id, e.target.value)}
                    placeholder="Your answer"
                  />
                </div>
              ))}
              <button type="submit" className="submit-btn">
                Submit Responses
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;