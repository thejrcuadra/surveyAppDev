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
  responses: '++id, surveyId, respondentId, questionId, answer, timestamp', // Separate responses table
  publishSurvey: '++id, surveyId, respondentId, questionId' // Separate table for published surveys
});

const { surveys, respondents, questions, surveyRespondents, surveyQuestions, responses, publishSurvey } = db;

function App() {
  const allSurveys = useLiveQuery(() => surveys.toArray(), []) || [];
  const allRespondents = useLiveQuery(() => respondents.toArray(), []) || [];
  const allQuestions = useLiveQuery(() => questions.toArray(), []) || [];
  const publishedSurveys = useLiveQuery(async () => {
    const published = await publishSurvey.toArray();
    const groupedBySurvey = {};
    
    for (const pub of published) {
      if (!groupedBySurvey[pub.surveyId]) {
        const survey = await surveys.get(pub.surveyId);
        const respondent = await respondents.get(pub.respondentId);
        const question = await questions.get(pub.questionId);
        groupedBySurvey[pub.surveyId] = {
          survey,
          respondents: [{ id: pub.respondentId, ...respondent }],
          questions: [{ id: pub.questionId, ...question }]
        };
      } else {
        if (!groupedBySurvey[pub.surveyId].respondents.find(r => r.id === pub.respondentId)) {
          const respondent = await respondents.get(pub.respondentId);
          groupedBySurvey[pub.surveyId].respondents.push({ id: pub.respondentId, ...respondent });
        }
        if (!groupedBySurvey[pub.surveyId].questions.find(q => q.id === pub.questionId)) {
          const question = await questions.get(pub.questionId);
          groupedBySurvey[pub.surveyId].questions.push({ id: pub.questionId, ...question });
        }
      }
    }
    
    return Object.values(groupedBySurvey);
  }, []) || [];

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
  const [editingRespondentId, setEditingRespondentId] = useState(null);
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [editRespondentName, setEditRespondentName] = useState('');
  const [editRespondentEmail, setEditRespondentEmail] = useState('');
  const [editQuestionText, setEditQuestionText] = useState('');
  const [selectedPublishSurveyId, setSelectedPublishSurveyId] = useState('');
  const [selectedPublishRespondentIds, setSelectedPublishRespondentIds] = useState([]);
  const [selectedPublishQuestionIds, setSelectedPublishQuestionIds] = useState([]);
  const [publishMessage, setPublishMessage] = useState('');
  const [showPublishMessage, setShowPublishMessage] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showSelectedItems, setShowSelectedItems] = useState({
    respondents: true,
    questions: true
  });
  const [selectedPublishedSurveyId, setSelectedPublishedSurveyId] = useState(null);

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

  const handleEditRespondent = async (respondentId) => {
    const respondent = selectedSurvey.respondents.find(r => r.id === respondentId);
    if (respondent) {
      setEditingRespondentId(respondentId);
      setEditRespondentName(respondent.name);
      setEditRespondentEmail(respondent.email);
    }
  };

  const handleSaveRespondent = async () => {
    if (editRespondentName && editRespondentEmail) {
      await respondents.update(editingRespondentId, {
        name: editRespondentName,
        email: editRespondentEmail
      });

      setSelectedSurvey({
        ...selectedSurvey,
        respondents: selectedSurvey.respondents.map(r =>
          r.id === editingRespondentId
            ? { ...r, name: editRespondentName, email: editRespondentEmail }
            : r
        )
      });

      setEditingRespondentId(null);
      setEditRespondentName('');
      setEditRespondentEmail('');
    }
  };

  const handleEditQuestion = async (questionId) => {
    const question = selectedSurvey.questions.find(q => q.id === questionId);
    if (question) {
      setEditingQuestionId(questionId);
      setEditQuestionText(question.text);
    }
  };

  const handleSaveQuestion = async () => {
    if (editQuestionText) {
      await questions.update(editingQuestionId, {
        text: editQuestionText
      });

      setSelectedSurvey({
        ...selectedSurvey,
        questions: selectedSurvey.questions.map(q =>
          q.id === editingQuestionId
            ? { ...q, text: editQuestionText }
            : q
        )
      });

      setEditingQuestionId(null);
      setEditQuestionText('');
    }
  };

  const handleCancelEdit = (type) => {
    if (type === 'respondent') {
      setEditingRespondentId(null);
      setEditRespondentName('');
      setEditRespondentEmail('');
    } else if (type === 'question') {
      setEditingQuestionId(null);
      setEditQuestionText('');
    }
  };

  const handlePublishSurvey = async (e) => {
    e.preventDefault();
    if (selectedPublishSurveyId && selectedPublishRespondentIds.length > 0 && selectedPublishQuestionIds.length > 0) {
      setIsPublishing(true);
      try {
        // Add all combinations to publishSurvey table
        const publishEntries = [];
        for (const respondentId of selectedPublishRespondentIds) {
          for (const questionId of selectedPublishQuestionIds) {
            publishEntries.push({
              surveyId: parseInt(selectedPublishSurveyId),
              respondentId: parseInt(respondentId),
              questionId: parseInt(questionId)
            });
          }
        }
        
        await publishSurvey.bulkAdd(publishEntries);
        setPublishMessage('Congratulations! Your survey has been published!');
        setShowPublishMessage(true);
        
        // Reset selections
        setSelectedPublishSurveyId('');
        setSelectedPublishRespondentIds([]);
        setSelectedPublishQuestionIds([]);

        setTimeout(() => {
          setShowPublishMessage(false);
          setPublishMessage('');
        }, 3000);
      } catch (error) {
        setPublishMessage('Failed to publish survey. Please try again.');
        setShowPublishMessage(true);
        setTimeout(() => {
          setShowPublishMessage(false);
          setPublishMessage('');
        }, 3000);
      } finally {
        setIsPublishing(false);
      }
    }
  };

  const handlePublishSelect = (type, id) => {
    if (type === 'respondent') {
      setSelectedPublishRespondentIds(prev => [...prev, id]);
    } else if (type === 'question') {
      setSelectedPublishQuestionIds(prev => [...prev, id]);
    }
  };

  const handleRemoveSelected = (type, id) => {
    if (type === 'respondent') {
      setSelectedPublishRespondentIds(prev => prev.filter(respId => respId !== id));
    } else if (type === 'question') {
      setSelectedPublishQuestionIds(prev => prev.filter(qId => qId !== id));
    }
  };

  const handleUnpublishSurvey = async (surveyId) => {
    if (window.confirm('Are you sure you want to unpublish this survey?')) {
      await publishSurvey.where('surveyId').equals(surveyId).delete();
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Create Surveys!</h1>
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

      {/* Publish Survey Section */}
      <section className="publish-survey-section">
        <h2>Publish Survey</h2>
        <form onSubmit={handlePublishSurvey}>
          <div className="form-group">
            <label htmlFor="publish-survey-select">Select Survey</label>
            <select
              id="publish-survey-select"
              value={selectedPublishSurveyId}
              onChange={(e) => setSelectedPublishSurveyId(e.target.value)}
              required
              disabled={isPublishing}
            >
              <option value="">-- Select Survey --</option>
              {allSurveys.map(survey => (
                <option key={survey.id} value={survey.id}>{survey.title}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <div className="selection-container">
              <div className="selection-header">
                <label>Select Respondents</label>
                <button 
                  type="button" 
                  className="toggle-btn"
                  onClick={() => setShowSelectedItems(prev => ({ ...prev, respondents: !prev.respondents }))}
                >
                  {showSelectedItems.respondents ? 'Hide Selected' : 'Show Selected'}
                </button>
              </div>
              <div className="dropdown-and-selected">
                <select
                  className="selection-dropdown"
                  onChange={(e) => handlePublishSelect('respondent', e.target.value)}
                  value=""
                  disabled={isPublishing}
                >
                  <option value="">-- Select Respondent --</option>
                  {allRespondents
                    .filter(r => !selectedPublishRespondentIds.includes(r.id.toString()))
                    .map(respondent => (
                      <option key={respondent.id} value={respondent.id}>
                        {respondent.name} ({respondent.email})
                      </option>
                    ))}
                </select>

                {showSelectedItems.respondents && selectedPublishRespondentIds.length > 0 && (
                  <div className="selected-items">
                    <h4>Selected Respondents:</h4>
                    <ul>
                      {selectedPublishRespondentIds.map(id => {
                        const respondent = allRespondents.find(r => r.id.toString() === id.toString());
                        return respondent ? (
                          <motion.li
                            key={id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.2 }}
                          >
                            <span>{respondent.name}</span>
                            <button
                              type="button"
                              className="remove-item-btn"
                              onClick={() => handleRemoveSelected('respondent', id)}
                              disabled={isPublishing}
                            >
                              ×
                            </button>
                          </motion.li>
                        ) : null;
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="form-group">
            <div className="selection-container">
              <div className="selection-header">
                <label>Select Questions</label>
                <button 
                  type="button" 
                  className="toggle-btn"
                  onClick={() => setShowSelectedItems(prev => ({ ...prev, questions: !prev.questions }))}
                >
                  {showSelectedItems.questions ? 'Hide Selected' : 'Show Selected'}
                </button>
              </div>
              <div className="dropdown-and-selected">
                <select
                  className="selection-dropdown"
                  onChange={(e) => handlePublishSelect('question', e.target.value)}
                  value=""
                  disabled={isPublishing}
                >
                  <option value="">-- Select Question --</option>
                  {allQuestions
                    .filter(q => !selectedPublishQuestionIds.includes(q.id.toString()))
                    .map(question => (
                      <option key={question.id} value={question.id}>
                        {question.text}
                      </option>
                    ))}
                </select>

                {showSelectedItems.questions && selectedPublishQuestionIds.length > 0 && (
                  <div className="selected-items">
                    <h4>Selected Questions:</h4>
                    <ul>
                      {selectedPublishQuestionIds.map(id => {
                        const question = allQuestions.find(q => q.id.toString() === id.toString());
                        return question ? (
                          <motion.li
                            key={id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.2 }}
                          >
                            <span>{question.text}</span>
                            <button
                              type="button"
                              className="remove-item-btn"
                              onClick={() => handleRemoveSelected('question', id)}
                              disabled={isPublishing}
                            >
                              ×
                            </button>
                          </motion.li>
                        ) : null;
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            className="publish-btn"
            disabled={isPublishing || !selectedPublishSurveyId || selectedPublishRespondentIds.length === 0 || selectedPublishQuestionIds.length === 0}
          >
            {isPublishing ? 'Publishing...' : 'Publish'}
          </button>
        </form>

        {showPublishMessage && (
          <motion.div 
            className="publish-message"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {publishMessage}
          </motion.div>
        )}
      </section>

      {/* Published Surveys Section */}
      <section className="published-surveys-section">
        <h2>Published Surveys</h2>
        {publishedSurveys.length === 0 ? (
          <p className="no-surveys">No published surveys yet.</p>
        ) : (
          <div className="published-surveys-container">
            <div className="published-survey-select">
              <select
                value={selectedPublishedSurveyId || ''}
                onChange={(e) => setSelectedPublishedSurveyId(e.target.value ? parseInt(e.target.value) : null)}
                className="published-survey-dropdown"
              >
                <option value="">-- Select a Published Survey --</option>
                {publishedSurveys.map(({ survey }) => (
                  <option key={survey.id} value={survey.id}>
                    {survey.title}
                  </option>
                ))}
              </select>
            </div>

            {selectedPublishedSurveyId && (
              <motion.div 
                className="published-survey-item"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                {publishedSurveys.map(({ survey, respondents, questions }) => {
                  if (survey.id === parseInt(selectedPublishedSurveyId)) {
                    return (
                      <React.Fragment key={survey.id}>
                        <div className="published-survey-header">
                          <h3>{survey.title}</h3>
                          <button
                            className="unpublish-btn"
                            onClick={() => {
                              handleUnpublishSurvey(survey.id);
                              setSelectedPublishedSurveyId(null);
                            }}
                            title="Unpublish Survey"
                          >
                            Unpublish
                          </button>
                        </div>

                        <div className="published-survey-details">
                          <div className="published-section">
                            <h4>Selected Respondents:</h4>
                            <ul>
                              {respondents.map(respondent => (
                                <li key={respondent.id}>
                                  {respondent.name} ({respondent.email})
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="published-section">
                            <h4>Selected Questions:</h4>
                            <ul>
                              {questions.map(question => (
                                <li key={question.id}>{question.text}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  }
                  return null;
                })}
              </motion.div>
            )}
          </div>
        )}
      </section>

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
                  <div className="action-buttons">
                    <button
                      className="edit-item-btn"
                      onClick={() => handleEditRespondent(respondent.id)}
                      title="Edit respondent"
                    >
                      ✏️
                    </button>
                    <button
                      className="delete-item-btn"
                      onClick={() => handleDeleteRespondent(respondent.id)}
                      title="Delete respondent from survey"
                    >
                      🗑️
                    </button>
                  </div>
                </motion.li>
              ))}
            </ul>
            {editingRespondentId && (
              <div className="edit-respondent">
                <input
                  type="text"
                  value={editRespondentName}
                  onChange={(e) => setEditRespondentName(e.target.value)}
                  placeholder="Edit name"
                />
                <input
                  type="email"
                  value={editRespondentEmail}
                  onChange={(e) => setEditRespondentEmail(e.target.value)}
                  placeholder="Edit email"
                />
                <button onClick={handleSaveRespondent}>Save</button>
                <button onClick={() => handleCancelEdit('respondent')}>Cancel</button>
              </div>
            )}
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
                  <div className="action-buttons">
                    <button
                      className="edit-item-btn"
                      onClick={() => handleEditQuestion(question.id)}
                      title="Edit question"
                    >
                      ✏️
                    </button>
                    <button
                      className="delete-item-btn"
                      onClick={() => handleDeleteQuestion(question.id)}
                      title="Delete question from survey"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                {editingQuestionId === question.id && (
                  <div className="edit-question">
                    <input
                      type="text"
                      value={editQuestionText}
                      onChange={(e) => setEditQuestionText(e.target.value)}
                      placeholder="Edit question"
                    />
                    <button onClick={handleSaveQuestion}>Save</button>
                    <button onClick={() => handleCancelEdit('question')}>Cancel</button>
                  </div>
                )}
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