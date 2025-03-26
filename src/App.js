import React, { useState } from 'react';
import './App.css';
import { Dexie } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';

// Initialize Dexie database
const db = new Dexie('surveyApp');
db.version(1).stores({
  surveys: '++id, title',
  respondents: '++id, name, email, surveyId',
  questions: '++id, text, surveyId, responses',
});

const { surveys, respondents, questions } = db;

function App() {
  // Fetch data using useLiveQuery
  const allSurveys = useLiveQuery(() => surveys.toArray(), []) || [];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isResponseModalOpen, setIsResponseModalOpen] = useState(false);
  const [newSurveyTitle, setNewSurveyTitle] = useState('');
  const [newRespondentName, setNewRespondentName] = useState('');
  const [newRespondentEmail, setNewRespondentEmail] = useState('');
  const [newQuestionText, setNewQuestionText] = useState('');
  const [tempRespondents, setTempRespondents] = useState([]);
  const [tempQuestions, setTempQuestions] = useState([]);
  const [selectedSurvey, setSelectedSurvey] = useState(null);
  const [responseAnswers, setResponseAnswers] = useState({});

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
      // Add survey to Dexie
      const surveyId = await surveys.add({
        title: newSurveyTitle,
      });

      // Add respondents to Dexie, associating them with the survey
      const respondentPromises = tempRespondents.map(respondent =>
        respondents.add({
          name: respondent.name,
          email: respondent.email,
          surveyId,
        })
      );
      await Promise.all(respondentPromises);

      // Add questions to Dexie, associating them with the survey
      const questionPromises = tempQuestions.map(question =>
        questions.add({
          text: question.text,
          surveyId,
          responses: [],
        })
      );
      await Promise.all(questionPromises);

      // Reset form
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
      // Delete survey
      await surveys.delete(id);
      // Delete associated respondents
      await respondents.where('surveyId').equals(id).delete();
      // Delete associated questions
      await questions.where('surveyId').equals(id).delete();
    }
  };

  const handleViewSurvey = async (survey) => {
    const surveyRespondents = await respondents.where('surveyId').equals(survey.id).toArray();
    const surveyQuestions = await questions.where('surveyId').equals(survey.id).toArray();
    setSelectedSurvey({ ...survey, respondents: surveyRespondents, questions: surveyQuestions });
    setIsViewModalOpen(true);
  };

  const handleSubmitResponse = async (survey) => {
    const surveyQuestions = await questions.where('surveyId').equals(survey.id).toArray();
    setSelectedSurvey({ ...survey, questions: surveyQuestions });
    setResponseAnswers({});
    setIsResponseModalOpen(true);
  };

  const handleResponseChange = (questionId, answer) => {
    setResponseAnswers({ ...responseAnswers, [questionId]: answer });
  };

  const handleSubmitResponses = async (e) => {
    e.preventDefault();
    const updatedQuestions = selectedSurvey.questions.map(question => {
      if (responseAnswers[question.id]) {
        return {
          ...question,
          responses: [
            ...question.responses,
            { respondentId: Date.now(), answer: responseAnswers[question.id] },
          ],
        };
      }
      return question;
    });

    // Update questions in Dexie
    const updatePromises = updatedQuestions.map(question =>
      questions.update(question.id, { responses: question.responses })
    );
    await Promise.all(updatePromises);

    setIsResponseModalOpen(false);
    setResponseAnswers({});
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Surveys</h1>
      </header>
      <main className="survey-container">
        {allSurveys.length === 0 ? (
          <p className="no-surveys">No surveys yet. Create one to get started!</p>
        ) : (
          <ul className="survey-list">
            {allSurveys.map(survey => (
              <li key={survey.id} className="survey-item">
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
              </li>
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
              <label htmlFor="survey-title">Survey Title</label>
              <input
                type="text"
                id="survey-title"
                value={newSurveyTitle}
                onChange={(e) => setNewSurveyTitle(e.target.value)}
                placeholder="Enter survey title"
                autoFocus
              />

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
                <li key={respondent.id}>
                  {respondent.name} ({respondent.email})
                </li>
              ))}
            </ul>
            <h3>Questions</h3>
            <ul>
              {selectedSurvey.questions.map(question => (
                <li key={question.id}>{question.text}</li>
              ))}
            </ul>
            <h3>Responses</h3>
            {selectedSurvey.questions.map(question => (
              <div key={question.id}>
                <p><strong>{question.text}</strong></p>
                {question.responses.length > 0 ? (
                  <ul>
                    {question.responses.map((response, idx) => (
                      <li key={idx}>{response.answer}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No responses yet.</p>
                )}
              </div>
            ))}
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