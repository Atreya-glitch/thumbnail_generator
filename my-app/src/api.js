const API_BASE = "/api";

export async function uploadHeadshot(file, token) {
    const formData = new FormData();
    formData.append("file", file);
    
    const response = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`
        },
        body: formData,
    });
    
    if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        // #region agent log
        fetch('http://127.0.0.1:7895/ingest/f8bfb2ea-b31b-41d8-bdf8-9c7ceaf3ef94',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f99e6c'},body:JSON.stringify({sessionId:'f99e6c',hypothesisId:'B',location:'api.js:uploadHeadshot',message:'upload failed',data:{status:response.status,detail:errBody.detail},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        throw new Error(errBody.detail || "Failed to upload headshot");
    }
    return response.json();
}

export async function createJob({ prompt, numThumbnails, headshotUrl }, token) {
    const response = await fetch(`${API_BASE}/jobs`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
            prompt: prompt,
            num_thumbnails: numThumbnails,
            headshot_url: headshotUrl,
        })
    });
    
    if (!response.ok) {
        throw new Error("Failed to create job");
    }
    return response.json();
}

export async function subscribeToJob(jobId, token, { onThumbnailReady, onThumbnailFailed, onJobComplete, onError }) {
    // Pass the Firebase token as a query parameter for EventSource since headers aren't supported natively
    const url = `${API_BASE}/jobs/${jobId}/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    
    es.addEventListener("thumbnail_ready", (event) => {
        onThumbnailReady(JSON.parse(event.data));
    });
    
    es.addEventListener("thumbnail_failed", (event) => {
        onThumbnailFailed(JSON.parse(event.data));
    });
    
    es.addEventListener("job_complete", (event) => {
        onJobComplete(JSON.parse(event.data));
        es.close();
    });
    
    es.addEventListener("error", (event) => {
        onError(event);
        es.close();
    });
    
    return es;
}