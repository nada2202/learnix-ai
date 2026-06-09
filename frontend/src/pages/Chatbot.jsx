import { useCallback, useEffect, useRef, useState } from "react";
import LearnixLayout from "../components/LearnixLayout";
import { useLanguage } from "../context/LanguageContext";

const initialMessages = () => [
  {
    role: "ai",
    textKey: "chatWelcome",
  },
];

const quickActionPrompts = {
  summarizePdf: {
    en: "Summarize the uploaded PDF in clear study notes.",
    fr: "Résume le PDF importé sous forme de notes de révision claires.",
    ar: "لخص ملف PDF المرفوع في ملاحظات دراسية واضحة.",
  },
  generateQuiz: {
    en: "Generate a short quiz from the uploaded lesson context.",
    fr: "Génère un court quiz à partir du cours importé.",
    ar: "أنشئ اختبارا قصيرا من محتوى الدرس المرفوع.",
  },
  generateExercises: {
    en: "Generate practice exercises from the uploaded lesson context.",
    fr: "Génère des exercices d'entraînement à partir du cours importé.",
    ar: "أنشئ تمارين تدريبية من محتوى الدرس المرفوع.",
  },
  explainChapter: {
    en: "Explain the main chapter from the uploaded lesson step by step.",
    fr: "Explique le chapitre principal du cours importé étape par étape.",
    ar: "اشرح الفصل الرئيسي من الدرس المرفوع خطوة بخطوة.",
  },
  keyConcepts: {
    en: "List the key concepts from the uploaded lesson with short explanations.",
    fr: "Liste les concepts clés du cours importé avec de courtes explications.",
    ar: "استخرج المفاهيم الأساسية من الدرس المرفوع مع شرح مختصر.",
  },
};

function Chatbot() {
  const { language, t } = useLanguage();
  const [messages, setMessages] = useState(() => initialMessages());
  const [input, setInput] = useState("");
  const [context, setContext] = useState("");
  const [contextSummary, setContextSummary] = useState("");
  const [uploadedFile, setUploadedFile] = useState(null);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [stream, setStream] = useState(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const messagesEndRef = useRef(null);


  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    setStream(null);
  }, [stream]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, uploading]);

  const addMessage = (role, text, extras = {}) => {
    setMessages((current) => [...current, { role, text, ...extras }]);
  };

  const showToast = (message) => {
    setToast(message);
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => setToast(""), 2400);
  };

  const sendQuestion = async (overrideMessage = "") => {
    const message = (overrideMessage || input).trim();

    if (!message || loading) {
      return;
    }

    if (!overrideMessage) {
      setInput("");
    }
    addMessage("student", message);

    try {
      setLoading(true);
      const response = await fetch("http://127.0.0.1:5000/chatbot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          language,
          context,
        }),
      });
      const data = await response.json();
      addMessage("ai", data.success ? data.answer : data.message || t.chatError);
    } catch {
      addMessage("ai", t.chatError);
    } finally {
      setLoading(false);
    }
  };

  const uploadLessonFile = async (file) => {
    if (!file) {
      return;
    }

    const isImage = file.type.startsWith("image/");
    const uploadedAt = new Date();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("language", language);

    try {
      setUploading(true);
      setUploadedFile({
        name: file.name,
        uploadedAt: uploadedAt.toISOString(),
        status: t.uploadingStatus,
        type: isImage ? "image" : "pdf",
        pages: null,
      });

      if (isImage) {
        const imageUrl = await readFileAsDataUrl(file);
        addMessage("student", `${t.uploadedFile}: ${file.name}`, { imageUrl });
      }

      const response = await fetch("http://127.0.0.1:5000/chatbot-upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (data.success) {
        setContext((current) => [current, data.context || ""].filter(Boolean).join("\n\n"));
        setContextSummary(data.summary || "");
        setUploadedFile({
          name: file.name,
          uploadedAt: uploadedAt.toISOString(),
          status: t.uploadReadyStatus,
          type: data.fileType || (isImage ? "image" : "pdf"),
          pages: data.pageCount ?? null,
        });
        if (!isImage) {
          addMessage("student", "", {
            fileCard: {
              name: file.name,
              status: t.uploadReadyStatus,
              pages: data.pageCount ?? null,
              uploadedAt: uploadedAt.toISOString(),
              type: data.fileType || "pdf",
            },
          });
        }
      } else {
        setUploadedFile({
          name: file.name,
          uploadedAt: uploadedAt.toISOString(),
          status: t.uploadFailedStatus,
          type: isImage ? "image" : "pdf",
          pages: null,
        });
        addMessage("ai", data.message || t.imageUnavailable);
      }
    } catch {
      setUploadedFile({
        name: file.name,
        uploadedAt: uploadedAt.toISOString(),
        status: t.uploadFailedStatus,
        type: isImage ? "image" : "pdf",
        pages: null,
      });
      addMessage("ai", t.chatUploadFailed);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    }
  };

  const startVoiceInput = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!Recognition) {
      showToast(t.voiceUnsupported);
      return;
    }

    const recognition = new Recognition();
    recognition.lang = language === "fr" ? "fr-FR" : language === "ar" ? "ar-SA" : "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput((current) => `${current} ${transcript}`.trim());
    };
    recognition.onerror = () => showToast(t.voiceUnsupported);
    recognition.start();
  };

  const openCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(t.cameraUnsupported);
      setCameraOpen(true);
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      setStream(mediaStream);
      setCameraError("");
      setCameraOpen(true);
    } catch {
      setCameraError(t.cameraUnsupported);
      setCameraOpen(true);
    }
  };

  const closeCamera = () => {
    stopCamera();
    setCameraOpen(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      return;
    }

    canvas.width = video.videoWidth || 960;
    canvas.height = video.videoHeight || 540;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) {
        uploadLessonFile(new File([blob], "camera-lesson.png", { type: "image/png" }));
      }
      closeCamera();
    }, "image/png");
  };

  const clearChat = () => {
    setMessages(initialMessages());
    setInput("");
    setContext("");
    setContextSummary("");
    setUploadedFile(null);
    stopCamera();
    setCameraOpen(false);
  };

  const runQuickAction = (key) => {
    const prompt = quickActionPrompts[key]?.[language] || quickActionPrompts[key]?.en || "";
    sendQuestion(prompt);
  };

  return (
    <LearnixLayout
      className="learnix-chat-page"
      title={t.chatbotTitle}
      subtitle={t.chatbotSubtitle}
    >
        <section className="learnix-chat-center">
          <section className="learnix-chat-shell">
            <div className="learnix-quick-actions" aria-label={t.quickActions}>
              <button type="button" onClick={() => runQuickAction("summarizePdf")} disabled={loading || !context}>
                {t.summarizePdf}
              </button>
              <button type="button" onClick={() => runQuickAction("generateQuiz")} disabled={loading || !context}>
                {t.generateQuiz}
              </button>
              <button type="button" onClick={() => runQuickAction("generateExercises")} disabled={loading || !context}>
                {t.generateExercises}
              </button>
              <button type="button" onClick={() => runQuickAction("explainChapter")} disabled={loading || !context}>
                {t.explainChapter}
              </button>
              <button type="button" onClick={() => runQuickAction("keyConcepts")} disabled={loading || !context}>
                {t.keyConcepts}
              </button>
            </div>

            <div className="learnix-chat-window">
              {messages.map((message, index) => (
                <div className={`learnix-message-row ${message.role}`} key={`${message.role}-${index}`}>
                  {message.role === "ai" && <span className="message-avatar">AI</span>}
                  <div className="learnix-message-bubble">
                    {message.imageUrl && (
                      <img className="learnix-chat-image-preview" src={message.imageUrl} alt={t.uploadedFile} />
                    )}
                    {message.fileCard && (
                      <div className="learnix-chat-file-card">
                        <PdfIcon />
                        <div>
                          <strong>{message.fileCard.name}</strong>
                          <small>
                            {message.fileCard.status}
                            {message.fileCard.pages ? ` / ${message.fileCard.pages} ${t.pages}` : ""}
                          </small>
                        </div>
                      </div>
                    )}
                    {message.textKey ? t[message.textKey] : message.text}
                  </div>
                </div>
              ))}
              {(loading || uploading) && (
                <div className="learnix-message-row ai">
                  <span className="message-avatar">AI</span>
                  <div className="learnix-message-bubble loading-bubble">{t.aiThinking}</div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="learnix-composer">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                hidden
                onChange={(event) => uploadLessonFile(event.target.files[0])}
              />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => uploadLessonFile(event.target.files[0])}
              />
              <textarea
                value={input}
                placeholder={t.chatPlaceholder}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendQuestion();
                  }
                }}
              />
              <div className="learnix-composer-actions">
                <button
                  className="learnix-icon-button"
                  type="button"
                  title={t.uploadPdf}
                  aria-label={t.uploadPdf}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <PdfIcon />
                </button>
                <button
                  className="learnix-icon-button"
                  type="button"
                  title={t.uploadImage}
                  aria-label={t.uploadImage}
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploading}
                >
                  <ImageIcon />
                </button>
                <button className="learnix-icon-button" type="button" title={t.takePhoto} aria-label={t.takePhoto} onClick={openCamera}>
                  <CameraIcon />
                </button>
                <button className="learnix-icon-button" type="button" title={t.microphone} aria-label={t.microphone} onClick={startVoiceInput}>
                  <MicIcon />
                </button>
                <button className="learnix-icon-button muted" type="button" title={t.clearChat} aria-label={t.clearChat} onClick={clearChat}>
                  <ClearIcon />
                </button>
                <button className="learnix-send-button" onClick={sendQuestion} disabled={loading || !input.trim()} aria-label={t.send}>
                  <SendIcon />
                </button>
              </div>
            </div>
          </section>
        </section>

      {cameraOpen && (
        <div className="camera-modal">
          <div className="camera-card">
            <div className="camera-header">
              <h2>{t.takePhoto}</h2>
              <button onClick={closeCamera}>{t.back}</button>
            </div>
            {cameraError ? (
              <p>{cameraError}</p>
            ) : (
              <video ref={videoRef} autoPlay playsInline />
            )}
            <canvas ref={canvasRef} hidden />
            <div className="quiz-actions">
              <button onClick={capturePhoto} disabled={Boolean(cameraError)}>
                {t.capture}
              </button>
              <button className="secondary-action" onClick={closeCamera}>
                {t.back}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast-notification warning-toast">{toast}</div>}
    </LearnixLayout>
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function PdfIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3h6l4 4v14H7z" />
      <path d="M13 3v5h4" />
      <path d="M8.8 16.5h6.4M8.8 13.2h6.4" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <path d="m7 16 3.2-3.2 2.4 2.4 2-2L19 17" />
      <circle cx="9" cy="9" r="1.4" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 7 10 5h4l1.5 2H18a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
      <circle cx="12" cy="12.8" r="3.2" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 7h12M9 7V5h6v2M9 10v7M12 10v7M15 10v7M7.5 7l.7 13h7.6l.7-13" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 12 16-8-5 16-3.2-6.2z" />
      <path d="m11.8 13.8 3.7-4.2" />
    </svg>
  );
}

export default Chatbot;
