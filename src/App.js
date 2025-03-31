import React, { useState } from 'react';
import './App.css';
import { Dexie } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';

// Initialize Dexie database with new schema
const db = new Dexie('surveyApp');
db.version(2).stores({
  surveys: '++id, title',           // Surveys remain standalone
  respondents: '++id, name, email', // Respondents no longer tied to surveyId
  questions: '++id, text',          // Questions no longer tied to surveyId, reusable
  surveyRespondents: '++id, surveyId, respondentId', // Junction table for survey-respondent
  surveyQuestions: '++id, surveyId, questionId',     // Junction table for survey-question
  responses: '++id, surveyId, respondentId, questionId, answer, timestamp' // Separate responses table
});

const { surveys, respondents, questions, surveyRespondents, surveyQuestions, responses } = db;

function App() {
  const allSurveys = useLiveQuery(() => surveys.toArray(), []) || [];
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isResponseModalOpen, setIsResponseModalOpen] = useState(false);
  const [isAddQuestionPopupOpen, setIsAddQuestionPopupOpen] = useState(false);
  const [newSurveyTitle, setNewSurveyTitle] = useState('');
  const [newRespondentName, setNewRespondentName] = useState('');
  const [newRespondentEmail, setNewRespondentEmail] = useState('');
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionInput, setNewQuestionInput] = useState('');
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
        { id: Date.now(), text: newQuestionText },
      ]);
      setNewQuestionText('');
    }
  };

  const handleCreateSurvey = async (e) => {
    e.preventDefault();
    if (newSurveyTitle && tempRespondents.length > 0 && tempQuestions.length > 0) {
      const surveyId = await surveys.add({ title: newSurveyTitle });

      // Add respondents if they don't exist, then link to survey
      const respondentIds = await Promise.all(tempRespondents.map(async (r) => {
        const existing = await respondents.where('email').equals(r.email).first();
        if (existing) return existing.id;
        return respondents.add({ name: r.name, email: r.email });
      }));

      // Add questions if they don't exist, then link to survey
      const questionIds = await Promise.all(tempQuestions.map(async (q) => {
        const existing = await questions.where('text').equals(q.text).first();
        if (existing) return existing.id;
        return questions.add({ text: q.text });
      }));

      // Link respondents to survey
      await surveyRespondents.bulkAdd(respondentIds.map(rId => ({ surveyId, respondentId: rId })));
      // Link questions to survey
      await surveyQuestions.bulkAdd(questionIds.map(qId => ({ surveyId, questionId: qId })));

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
      await surveyRespondents.where('surveyId').equals(id).delete();
      await surveyQuestions.where('surveyId').equals(id).delete();
      await responses.where('surveyId').equals(id).delete();
    }
  };

  const handleViewSurvey = async (survey) => {
    const surveyRespLinks = await surveyRespondents.where('surveyId').equals(survey.id).toArray();
    const respondentIds = surveyRespLinks.map(link => link.respondentId);
    const surveyQuestLinks = await surveyQuestions.where('surveyId').equals(survey.id).toArray();
    const questionIds = surveyQuestLinks.map(link => link.questionId);

    const surveyRespondentsData = await respondents.where('id').anyOf(respondentIds).toArray();
    const surveyQuestionsData = await questions.where('id').anyOf(questionIds).toArray();
    const surveyResponses = await responses.where('surveyId').equals(survey.id).toArray();

    setSelectedSurvey({
      ...survey,
      respondents: surveyRespondentsData,
      questions: surveyQuestionsData.map(q => ({
        ...q,
        responses: surveyResponses.filter(r => r.questionId === q.id)
      }))
    });
    setIsViewModalOpen(true);
  };

  const handleDeleteRespondent = async (respondentId) => {
    if (window.confirm('Are you sure you want to delete this respondent from this survey?')) {
      await surveyRespondents.where({ surveyId: selectedSurvey.id, respondentId }).delete();
      await responses.where({ surveyId: selectedSurvey.id, respondentId }).delete();
      setSelectedSurvey({
        ...selectedSurvey,
        respondents: selectedSurvey.respondents.filter(r => r.id !== respondentId),
        questions: selectedSurvey.questions.map(q => ({
          ...q,
          responses: q.responses.filter(r => r.respondentId !== respondentId)
        }))
      });
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (window.confirm('Are you sure you want to delete this question from this survey?')) {
      await surveyQuestions.where({ surveyId: selectedSurvey.id, questionId }).delete();
      await responses.where({ surveyId: selectedSurvey.id, questionId }).delete();
      setSelectedSurvey({
        ...selectedSurvey,
        questions: selectedSurvey.questions.filter(q => q.id !== questionId)
      });
    }
  };

  const handleAddNewQuestion = async () => {
    if (newQuestionInput.trim()) {
      const existingQuestion = await questions.where('text').equals(newQuestionInput).first();
      const questionId = existingQuestion ? existingQuestion.id : await questions.add({ text: newQuestionInput });
      
      await surveyQuestions.add({ surveyId: selectedSurvey.id, questionId });
      const newQuestion = { id: questionId, text: newQuestionInput, responses: [] };
      setSelectedSurvey({
        ...selectedSurvey,
        questions: [...selectedSurvey.questions, newQuestion]
      });
      setNewQuestionInput('');
      setIsAddQuestionPopupOpen(false);
    } else {
      alert('Please enter a question.');
    }
  };

  const handleSubmitResponse = async (survey) => {
    const surveyRespLinks = await surveyRespondents.where('surveyId').equals(survey.id).toArray();
    const respondentIds = surveyRespLinks.map(link => link.respondentId);
    const surveyQuestLinks = await surveyQuestions.where('surveyId').equals(survey.id).toArray();
    const questionIds = surveyQuestLinks.map(link => link.questionId);

    const surveyRespondentsData = await respondents.where('id').anyOf(respondentIds).toArray();
    const surveyQuestionsData = await questions.where('id').anyOf(questionIds).toArray();

    setSelectedSurvey({ ...survey, respondents: surveyRespondentsData, questions: surveyQuestionsData });
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
      const existingRespondent = await respondents.where('email').equals(customRespondentEmail).first();
      respondentId = existingRespondent ? existingRespondent.id : await respondents.add({
        name: customRespondentName,
        email: customRespondentEmail
      });
      await surveyRespondents.add({ surveyId: selectedSurvey.id, respondentId });
      setSelectedSurvey({
        ...selectedSurvey,
        respondents: [...selectedSurvey.respondents, { id: respondentId, name: customRespondentName, email: customRespondentEmail }]
      });
    } else if (!respondentId) {
      setErrorMessage('Please select a respondent or add a new one');
      return;
    }

    const responseEntries = Object.entries(responseAnswers).map(([questionId, answer]) => ({
      surveyId: selectedSurvey.id,
      respondentId: parseInt(respondentId),
      questionId: parseInt(questionId),
      answer,
      timestamp: Date.now()
    }));

    await responses.bulkAdd(responseEntries);
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
                <p className="note">Existing respondents will be linked if email matches.</p>
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
                <p className="note">Existing questions will be reused if text matches.</p>
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
                    title="Delete respondent from survey"
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
                    title="Delete question from survey"
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