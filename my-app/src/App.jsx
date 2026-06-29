import { useState, useEffect, useRef } from 'react';
import { 
  auth, 
  googleProvider, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from './firebase';
import { uploadHeadshot, createJob, subscribeToJob } from './api';

function App() {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [authMode, setAuthMode] = useState('signin'); // 'signin' or 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

 
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [headshotUrl, setHeadshotUrl] = useState('');
  const [prompt, setPrompt] = useState('');
  const [numThumbnails, setNumThumbnails] = useState(3);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragging, setDragging] = useState(false);


  const [jobId, setJobId] = useState('');
  const [jobStatus, setJobStatus] = useState('');
  const [thumbnails, setThumbnails] = useState([]);

  const eventSourceRef = useRef(null);


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoadingUser(false);
    });
    return () => unsubscribe();
  }, []);


  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);


  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    if (!email || !password) {
      setAuthError('Please fill in all fields.');
      setAuthLoading(false);
      return;
    }

    try {
      if (authMode === 'signin') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      setEmail('');
      setPassword('');
    } catch (err) {
      console.error(err);
      setAuthError(err.message.replace('Firebase: ', ''));
    } finally {
      setAuthLoading(false);
    }
  };

  // Google Sign In
  const handleGoogleSignIn = async () => {
    setAuthError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error(err);
      setAuthError(err.message.replace('Firebase: ', ''));
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      await signOut(auth);
   
      setFile(null);
      setPreviewUrl(null);
      setHeadshotUrl('');
      setPrompt('');
      setNumThumbnails(3);
      setJobId('');
      setJobStatus('');
      setThumbnails([]);
      setIsGenerating(false);
      setErrorMsg('');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  // File drag & drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => {
    setDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith('image/')) {
      await processSelectedFile(droppedFile);
    } else {
      setErrorMsg('Please upload a valid image file.');
    }
  };

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      await processSelectedFile(selectedFile);
    }
  };

  const processSelectedFile = async (selectedFile) => {
    setFile(selectedFile);
    setPreviewUrl(URL.createObjectURL(selectedFile));
    setErrorMsg('');
    
    // Auto-upload headshot to backend
    setIsUploading(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await uploadHeadshot(selectedFile, token);
      setHeadshotUrl(res.url);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to upload headshot image to server.');
      setFile(null);
      setPreviewUrl(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemovePreview = (e) => {
    e.stopPropagation();
    setFile(null);
    setPreviewUrl(null);
    setHeadshotUrl('');
    setErrorMsg('');
  };

  // Start generation process
  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!headshotUrl) {
      setErrorMsg('Please upload a headshot first.');
      return;
    }
    if (!prompt.trim()) {
      setErrorMsg('Please enter a generation prompt.');
      return;
    }

    setErrorMsg('');
    setIsGenerating(true);
    setJobStatus('initializing');
    setThumbnails([]);

    try {
      const token = await auth.currentUser.getIdToken();
      // Initialize job on the backend
      const jobData = await createJob({
        prompt: prompt.trim(),
        numThumbnails: numThumbnails,
        headshotUrl: headshotUrl
      }, token);

      setJobId(jobData.job_id);
      setJobStatus('processing');
      
      // Initialize local thumbnail representations
      const initialThumbs = Array.from({ length: numThumbnails }).map((_, index) => {
        const styles = ["vibrant_energetic", "clean_minimalist", "bold_dramatic"];
        return {
          id: `temp-${index}`,
          style_name: styles[index],
          status: 'pending',
          imagekit_url: null,
          error_message: null,
          display_url: null,
          variants: {}
        };
      });
      setThumbnails(initialThumbs);

      // Subscribe to Server-Sent Events for job status tracking
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      eventSourceRef.current = await subscribeToJob(jobData.job_id, token, {
        onThumbnailReady: (data) => {
          setThumbnails((prev) => 
            prev.map((t) => {
              if (t.style_name === data.style_name) {
                return {
                  ...t,
                  id: data.thumbnail_id,
                  status: data.status,
                  imagekit_url: data.imagekit_url,
                  display_url: data.imagekit_url,
                  variants: data.variants || {}
                };
              }
              return t;
            })
          );
        },
        onThumbnailFailed: (data) => {
          setThumbnails((prev) => 
            prev.map((t) => {
              if (t.style_name === data.style_name) {
                return {
                  ...t,
                  id: data.thumbnail_id,
                  status: data.status,
                  error_message: data.error_message
                };
              }
              return t;
            })
          );
        },
        onJobComplete: (data) => {
          setJobStatus(data.status);
          setIsGenerating(false);
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
          }
        },
        onError: (err) => {
          console.error("SSE stream error:", err);
          setErrorMsg("Real-time connection failed, polling backend for final job status...");
          setIsGenerating(false);
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
          }
        }
      });

    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to trigger thumbnail generation.');
      setIsGenerating(false);
      setJobStatus('failed');
    }
  };

  // Change selected resolution variant
  const handleVariantChange = (thumbId, variantUrl) => {
    setThumbnails((prev) =>
      prev.map((t) => (t.id === thumbId ? { ...t, display_url: variantUrl } : t))
    );
  };

  // Copy link helper
  const copyToClipboard = (url) => {
    navigator.clipboard.writeText(url)
      .then(() => alert('Copied image link to clipboard!'))
      .catch((err) => console.error('Failed to copy text: ', err));
  };

  // Loader during auth initialization
  if (loadingUser) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0b0e', color: '#fff' }}>
        <div className="card-spinner" style={{ width: '40px', height: '40px', borderWidth: '4px' }}></div>
      </div>
    );
  }

  // Auth Screen Layout
  if (!user) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Thumbnail Studio</h1>
            <p>{authMode === 'signin' ? 'Sign in to generate AI thumbnails' : 'Create an account to get started'}</p>
          </div>

          {authError && <div className="auth-error">{authError}</div>}

          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="form-group">
              <label>Email Address</label>
              <input 
                type="email" 
                className="form-input" 
                placeholder="you@example.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label>Password</label>
              <div className="password-input-wrapper">
                <input 
                  type={showPassword ? 'text' : 'password'}
                  className="form-input password-input" 
                  placeholder="••••••••" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg className="password-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <path d="M1 1l22 22" />
                      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                    </svg>
                  ) : (
                    <svg className="password-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button type="submit" className="auth-btn" disabled={authLoading}>
              {authLoading ? 'Please wait...' : authMode === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          <div className="auth-divider">
            <span>or continue with</span>
          </div>

          <button onClick={handleGoogleSignIn} className="google-btn">
            <svg className="google-icon" viewBox="0 0 24 24">
              <path fill="#ea4335" d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.53-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l3.227-3.1C18.281 1.96 15.42 1 12.24 1 5.922 1 1 5.922 1 12s4.922 11 11.24 11c6.598 0 10.985-4.636 10.985-11.176 0-.751-.08-1.328-.18-1.785z"/>
            </svg>
            Google Account
          </button>

          <div className="auth-footer">
            {authMode === 'signin' ? (
              <p>Don't have an account? <a href="#" onClick={(e) => { e.preventDefault(); setAuthMode('signup'); setAuthError(''); }}>Sign Up</a></p>
            ) : (
              <p>Already have an account? <a href="#" onClick={(e) => { e.preventDefault(); setAuthMode('signin'); setAuthError(''); }}>Sign In</a></p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Dashboard Screen Layout
  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="logo-section">
          <h2>Thumbnail Studio</h2>
        </div>
        <div className="user-profile">
          <span className="user-email">{user.displayName || user.email}</span>
          <button onClick={handleLogout} className="logout-btn">Log Out</button>
        </div>
      </header>

      <main className="dashboard-main">
        {/* Left Control Panel */}
        <section className="control-panel">
          <h3>Generation Setup</h3>
          
          {errorMsg && <div className="auth-error" style={{ marginBottom: '1.5rem' }}>{errorMsg}</div>}

          <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="form-group">
              <label>1. Upload Face Headshot</label>
              <div 
                className={`upload-zone ${dragging ? 'dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById('headshot-upload-input').click()}
              >
                <input 
                  type="file" 
                  id="headshot-upload-input" 
                  accept="image/*" 
                  style={{ display: 'none' }} 
                  onChange={handleFileChange}
                />
                
                {previewUrl ? (
                  <div className="preview-container">
                    <img src={previewUrl} className="preview-image" alt="Headshot preview" />
                    <button type="button" className="remove-preview-btn" onClick={handleRemovePreview}>×</button>
                  </div>
                ) : (
                  <>
                    <div className="upload-icon">↑</div>
                    <p className="upload-prompt">
                      {isUploading ? 'Uploading headshot...' : (
                        <>Drag & drop or <span>browse</span></>
                      )}
                    </p>
                    <p className="upload-hint">Supports PNG, JPG (Max 5MB)</p>
                  </>
                )}
              </div>
            </div>

            <div className="form-group">
              <label>2. Describe Your Thumbnail Idea</label>
              <textarea 
                className="form-input" 
                style={{ height: '110px', resize: 'none', fontFamily: 'inherit' }}
                placeholder="Describe what your video is about (e.g., 'React hooks tutorial with code background', 'Extreme gaming setup build review')"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>3. Select Variations Count</label>
              <div className="style-select-group">
                {[1, 2, 3].map((num) => (
                  <div 
                    key={num}
                    className={`style-select-card ${numThumbnails === num ? 'selected' : ''}`}
                    onClick={() => setNumThumbnails(num)}
                  >
                    <span className="number">{num}</span>
                    <span className="label">{num === 1 ? 'Single Style' : num === 2 ? 'Double Style' : 'Triple Pack'}</span>
                  </div>
                ))}
              </div>
            </div>

            <button 
              type="submit" 
              className="generate-btn"
              disabled={isUploading || isGenerating || !headshotUrl || !prompt.trim()}
            >
              {isGenerating ? 'Generating Studio Pack...' : 'Generate Thumbnails'}
            </button>
          </form>

          {/* Job Pipeline visualizer */}
          {jobStatus && (
            <div className="pipeline-container">
              <div className="pipeline-header">
                <span className="pipeline-title">Active Generation Pipeline</span>
                <span className={`pipeline-status ${jobStatus}`}>{jobStatus}</span>
              </div>
              <div className="pipeline-steps">
                <div className={`pipeline-step ${jobStatus === 'initializing' ? 'active' : 'completed'}`}>
                  <div className="step-indicator">1</div>
                  <span>Uploading profile headshot to ImageKit</span>
                </div>
                <div className={`pipeline-step ${jobStatus === 'processing' ? 'active' : jobStatus === 'completed' || jobStatus === 'failed' ? 'completed' : ''}`}>
                  <div className="step-indicator">2</div>
                  <span>Triggering parallel AI generations</span>
                </div>
                <div className={`pipeline-step ${jobStatus === 'completed' ? 'completed' : jobStatus === 'failed' ? 'failed' : ''}`}>
                  <div className="step-indicator">3</div>
                  <span>Applying dynamic multi-format dimensions</span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Right Output Results Panel */}
        <section className="results-panel">
          <h3>Generated Outputs</h3>

          {thumbnails.length === 0 ? (
            <div className="placeholder-results">
              <div className="placeholder-icon">📷</div>
              <h4>No thumbnails generated yet</h4>
              <p style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>Configure setup and click generate on the left to see results here.</p>
            </div>
          ) : (
            <div className="thumbnail-grid">
              {thumbnails.map((t) => (
                <div key={t.id} className="thumbnail-card">
                  <div className="card-image-wrapper">
                    {t.status === 'pending' || t.status === 'generating' ? (
                      <>
                        <div className="card-spinner"></div>
                        <div style={{ position: 'absolute', bottom: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Generating {t.style_name.replace('_', ' ')}...</div>
                      </>
                    ) : t.status === 'failed' ? (
                      <div className="card-error">
                        <span>Generation Failed:<br />{t.error_message || 'Unknown generation error'}</span>
                      </div>
                    ) : (
                      <img src={t.display_url || t.imagekit_url} className="card-image" alt={t.style_name} />
                    )}
                  </div>
                  
                  <div className="card-content">
                    <h4 className="card-title">{t.style_name.replace('_', ' ')}</h4>
                    <span className="card-style-name">AI Generated Template</span>

                    {t.status === 'uploaded' && (
                      <>
                        <div className="variants-selector">
                          <label>Dimensions Variant</label>
                          <select 
                            className="variants-dropdown"
                            onChange={(e) => handleVariantChange(t.id, e.target.value)}
                          >
                            <option value={t.imagekit_url}>Original square (1024x1024)</option>
                            {t.variants.youtube && <option value={t.variants.youtube}>YouTube Video standard (1280x720)</option>}
                            {t.variants.short && <option value={t.variants.short}>YouTube Short vertical (1080x1920)</option>}
                            {t.variants.square && <option value={t.variants.square}>Instagram Square (1080x1080)</option>}
                          </select>
                        </div>
                        
                        <div className="card-actions">
                          <a 
                            href={t.display_url || t.imagekit_url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="download-link"
                          >
                            Open Link
                          </a>
                          <button 
                            className="copy-btn" 
                            title="Copy link"
                            onClick={() => copyToClipboard(t.display_url || t.imagekit_url)}
                          >
                            📋
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
