"use client";
import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowUp, BarChart3, CheckCircle2, Download, FileSpreadsheet, Filter, Globe, LoaderCircle, Paperclip, Search, Sparkles, Star, X } from "lucide-react";

const API = (process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "")).replace(/\/$/, "");
type Review = {
  review_id: string; review_title: string; review_text: string; rating: number | null;
  review_date: string; variant: string; verified_purchase: boolean | string;
  source_url: string; sentiment: "positive" | "neutral" | "negative" | "unclassified";
  aspects: string[]; pros: string[]; cons: string[];
};
type Result = { asin: string; product_url: string; review_count_collected: number; review_count_analyzed: number; requested_review_count: number; reviews: Review[]; analysis: string; source_mode: string; notice: string };
type TaskError = { code: string; message: string; action?: string };

const errorTitles: Record<string, string> = {
  AUTHENTICATION_REQUIRED: "Sign-in required by Amazon",
  SECURITY_CHALLENGE: "Amazon security check",
  REVIEW_ACCESS_RESTRICTED: "Review access restricted",
  MARKETPLACE_REDIRECT: "Marketplace redirect",
  EXTERNAL_REDIRECT: "Unexpected external redirect",
  RATE_LIMITED: "Amazon rate limited the request",
  NO_REVIEWS_FOUND: "No accessible reviews found",
  PROVIDER_PARSING_INCIDENT: "Rainforest parser temporarily unavailable",
  PROVIDER_RATE_LIMITED: "Rainforest rate limited the request",
  PROVIDER_CREDITS_EXHAUSTED: "Rainforest account needs attention",
  PROVIDER_AUTH_ERROR: "Rainforest API key was rejected",
  PROVIDER_BAD_REQUEST: "Rainforest rejected the request",
  DATAFORSEO_MARKETPLACE_UNSUPPORTED: "Backup provider does not support this marketplace",
  DATAFORSEO_REQUEST_ERROR: "DataForSEO request failed",
  DATAFORSEO_TASK_ERROR: "DataForSEO could not complete the review task",
  DATAFORSEO_TASK_PENDING: "DataForSEO is still processing reviews",
  SCRAPERAPI_MARKETPLACE_UNSUPPORTED: "ScraperAPI does not support this marketplace",
  SCRAPERAPI_CONNECTION_ERROR: "Could not connect to ScraperAPI",
  SCRAPERAPI_INVALID_RESPONSE: "ScraperAPI returned an invalid response",
  SCRAPERAPI_RATE_LIMITED: "ScraperAPI rate limited the request",
  SCRAPERAPI_REQUEST_ERROR: "ScraperAPI request failed",
  SCRAPERAPI_NO_REVIEW_TEXT: "ScraperAPI returned no review text",
  SCRAPELY_AUTH_ERROR: "Scrape.ly API token was rejected",
  SCRAPELY_CONNECTION_ERROR: "Could not connect to Scrape.ly",
  SCRAPELY_INVALID_RESPONSE: "Scrape.ly returned an invalid response",
  SCRAPELY_REQUEST_ERROR: "Scrape.ly rejected the run",
  SCRAPELY_STATUS_ERROR: "Could not check the Scrape.ly run",
  SCRAPELY_RESULT_ERROR: "Could not download Scrape.ly results",
  SCRAPELY_RUN_FAILED: "Scrape.ly run failed",
  SCRAPELY_RUN_PENDING: "Scrape.ly is still processing reviews",
  SCRAPELY_NO_REVIEW_TEXT: "Scrape.ly returned no review text",
  REVIEW_PROVIDERS_UNAVAILABLE: "Review providers could not collect reviews",
  BRIGHTDATA_AUTH_ERROR: "Bright Data API token was rejected",
  BRIGHTDATA_CONNECTION_ERROR: "Could not connect to Bright Data",
  BRIGHTDATA_INVALID_RESPONSE: "Bright Data returned an invalid response",
  BRIGHTDATA_REQUEST_ERROR: "Bright Data request failed",
  BRIGHTDATA_PROGRESS_ERROR: "Could not check Bright Data job status",
  BRIGHTDATA_RESULT_ERROR: "Could not download Bright Data results",
  BRIGHTDATA_SNAPSHOT_FAILED: "Bright Data collection failed",
  BRIGHTDATA_SNAPSHOT_PENDING: "Bright Data is still collecting reviews",
  BRIGHTDATA_NO_REVIEW_TEXT: "Bright Data returned no review text",
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("Analyze sentiment, product aspects, recurring complaints, pros and cons, and prepare an evidence-backed report.");
  const [maxReviews, setMaxReviews] = useState("100");
  const [collectionStars, setCollectionStars] = useState<number[]>([]);
  const [reviewFile, setReviewFile] = useState<File | null>(null);
  const [instructionFiles, setInstructionFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<TaskError | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [stars, setStars] = useState<number[]>([]);
  const [sentiment, setSentiment] = useState("all");
  const [reviewType, setReviewType] = useState("all");
  const [aspect, setAspect] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const instructionRef = useRef<HTMLInputElement>(null);
  const reviewFileRef = useRef<HTMLInputElement>(null);

  async function analyze(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if ((!url.trim() && !reviewFile) || busy) return;
    setBusy(true); setStatus(reviewFile ? "Loading uploaded reviews" : "Collecting reviews from product URL"); setError(null); setResult(null); resetFilters();
    const form = new FormData();
    form.append("url", url.trim()); form.append("prompt", prompt); form.append("max_reviews", maxReviews);
    form.append("star_ratings", collectionStars.join(","));
    if (reviewFile) form.append("review_file", reviewFile);
    if (instructionFiles) Array.from(instructionFiles).forEach(f => form.append("instructions", f));
    try {
      const response = await fetch(`${API}/api/analyze`, { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data?.detail;
        if (typeof detail === "object" && detail !== null) {
          setError({
            code: typeof detail.code === "string" ? detail.code : `HTTP_${response.status}`,
            message: typeof detail.message === "string" ? detail.message : "Review collection failed.",
            action: typeof detail.action === "string" ? detail.action : undefined,
          });
        } else {
          setError({
            code: `HTTP_${response.status}`,
            message: typeof detail === "string" ? detail : `Request failed (HTTP ${response.status}). Check that the backend is running at ${API}.`,
          });
        }
        setStatus("Task needs attention");
        return;
      }
      setStatus("Reviews collected and analyzed"); setResult(data as Result);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      setStatus("Task needs attention"); setError({ code: "REQUEST_FAILED", message });
    } finally { setBusy(false); }
  }

  function resetFilters() {
    setStars([]); setSentiment("all"); setReviewType("all"); setAspect("all"); setKeyword(""); setVerifiedOnly(false); setDateFrom(""); setDateTo("");
  }

  const filteredReviews = useMemo(() => {
    if (!result) return [];
    const term = keyword.trim().toLowerCase();
    return result.reviews.filter(r => {
      if (stars.length && (!r.rating || !stars.includes(Math.round(r.rating)))) return false;
      if (sentiment !== "all" && r.sentiment !== sentiment) return false;
      if (reviewType === "pros" && !r.pros?.length) return false;
      if (reviewType === "cons" && !r.cons?.length) return false;
      if (aspect !== "all" && !(r.aspects || []).some(a => a.toLowerCase() === aspect.toLowerCase())) return false;
      if (term && !`${r.review_title} ${r.review_text} ${(r.pros || []).join(" ")} ${(r.cons || []).join(" ")}`.toLowerCase().includes(term)) return false;
      if (verifiedOnly && !(r.verified_purchase === true || String(r.verified_purchase).toLowerCase() === "true" || String(r.verified_purchase).toLowerCase().includes("verified"))) return false;
      if (dateFrom && r.review_date && r.review_date < dateFrom) return false;
      if (dateTo && r.review_date && r.review_date > dateTo) return false;
      return true;
    });
  }, [result, stars, sentiment, reviewType, aspect, keyword, verifiedOnly, dateFrom, dateTo]);

  async function downloadDataset(format: "csv" | "xlsx") {
    if (!result) return;
    try {
      const response = await fetch(`${API}/api/export/${format}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviews: filteredReviews }),
      });
      if (!response.ok) throw new Error("Export failed. Please try again.");
      const blob = await response.blob(); const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = objectUrl; a.download = format === "csv" ? "product-reviews.csv" : "product-reviews.xlsx"; a.click(); URL.revokeObjectURL(objectUrl);
    } catch (e) { setError({ code: "EXPORT_FAILED", message: e instanceof Error ? e.message : "Export failed." }); }
  }

  function downloadReport() {
    if (!result) return;
    const content = `PRODUCT REVIEW INTELLIGENCE REPORT\nProduct URL: ${result.product_url}\nASIN: ${result.asin}\nCollected reviews: ${result.review_count_collected}\nCurrently filtered reviews: ${filteredReviews.length}\nSource: ${result.source_mode}\n\n${result.analysis}\n\nLimitations: ${result.notice}\n`;
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" })); a.download = "product-review-report.txt"; a.click(); URL.revokeObjectURL(a.href);
  }

  const allAspects = Array.from(new Set((result?.reviews || []).flatMap(r => r.aspects || []))).sort();
  const sentimentCounts = result?.reviews.reduce((acc, r) => { acc[r.sentiment] = (acc[r.sentiment] || 0) + 1; return acc; }, {} as Record<string, number>) || {};

  return <main className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Sparkles size={18}/></div><span>Reviewly</span><small>AI workspace</small></div>
      <button className="new-task" onClick={() => {setResult(null);setError(null);setStatus("Ready");setUrl("");setCollectionStars([]);setReviewFile(null);if(reviewFileRef.current)reviewFileRef.current.value="";setInstructionFiles(null);if(instructionRef.current)instructionRef.current.value="";resetFilters();}}>＋ <span>New analysis</span></button>
      <div className="nav-label">WORKSPACE</div>
      <div className="nav active"><BarChart3 size={17}/> Review intelligence</div>
      <div className="sidebar-note"><div className="note-icon"><Star size={16}/></div><strong>From reviews to insights</strong><p>Collect accessible product reviews, analyze customer feedback, and export the evidence.</p></div>
      <div className="account"><div className="avatar">R</div><div><b>Demo workspace</b><small>Prototype mode</small></div></div>
    </aside>
    <section className="main">
      <header className="topbar"><div><span>Workspace</span><i>/</i><b>Product review analysis</b></div><div className="model"><span/> Groq · backend configured</div></header>
      <div className="content">
        <section className="hero"><div className={`orb ${busy ? "active" : ""}`}><div/></div><div className="eyebrow"><Sparkles size={13}/> AI REVIEW INTELLIGENCE</div><h1>Listen to what customers <em>really think.</em></h1><p>Enter a product URL or upload a review file. The app analyzes accessible feedback and generates your dataset.</p></section>

        <form className="input-card" onSubmit={analyze}>
          <label className="field-label"><Globe size={15}/> Amazon product page URL <span className="optional">Optional when uploading reviews</span></label>
          <input className="url" type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://www.amazon.com/dp/B0XXXXXXXXX" />
          <div className="source-note">Review collection uses configured providers in order. Bright Data is available when BRIGHTDATA_API_TOKEN is set in backend/.env.</div>
          <label className="field-label"><FileSpreadsheet size={15}/> Or upload existing reviews <span className="optional">CSV or XLSX · no provider fee</span></label>
          <label className="upload secondary upload-label" htmlFor="review-upload"><FileSpreadsheet size={18}/><span><b>{reviewFile?.name || "Choose a review dataset"}</b><small>Needs a review text column such as review_text, review, body, content, or text</small></span><span className="choose-file">Browse files</span></label>
          <input id="review-upload" ref={reviewFileRef} className="file-input" type="file" accept=".csv,.xlsx,.xlsm" onChange={e=>{const file=e.target.files?.[0] || null;setReviewFile(file);setError(null);}} />
          {reviewFile && <div className="selected-files"><span>{reviewFile.name}</span><button type="button" onClick={()=>{setReviewFile(null);if(reviewFileRef.current)reviewFileRef.current.value="";}}>Remove dataset</button></div>}
          <label className="field-label"><Star size={15}/> Ratings to collect <span className="optional">Optional · all ratings by default</span></label>
          <div className="star-filter collection-stars">{[1,2,3,4,5].map(n=><button type="button" key={n} aria-pressed={collectionStars.includes(n)} className={collectionStars.includes(n)?"selected":""} onClick={()=>setCollectionStars(prev=>prev.includes(n)?prev.filter(s=>s!==n):[...prev,n])}>{n} <Star size={12} fill="currentColor"/></button>)}<button type="button" className="all-stars" onClick={()=>setCollectionStars([])}>All</button></div>
          <div className="source-note">For example, select only 4 to collect 4-star reviews. The source may return fewer reviews than requested.</div>
          <label className="field-label"><BarChart3 size={15}/> Maximum reviews to analyze</label>
          <select className="select" value={maxReviews} onChange={e=>setMaxReviews(e.target.value)}><option value="50">Up to 50 reviews</option><option value="100">Up to 100 reviews</option><option value="200">Up to 200 reviews</option><option value="500">Up to 500 reviews (if configured)</option></select>
          <label className="field-label"><Paperclip size={15}/> Instructions or output template <span className="optional">Optional</span></label>
          <label className="upload secondary upload-label" htmlFor="instruction-upload"><Paperclip size={18}/><span><b>{instructionFiles?.length ? `${instructionFiles.length} file(s) selected` : "Choose instruction or template files"}</b><small>PDF, DOCX, XLSX, CSV, TXT, Markdown · up to 5 files</small></span><span className="choose-file">Browse files</span></label>
          <input id="instruction-upload" ref={instructionRef} className="file-input" type="file" multiple accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.json" onChange={e=>{if(e.target.files && e.target.files.length>5){setError({code:"TOO_MANY_FILES",message:"Please choose no more than 5 instruction files."});e.target.value="";setInstructionFiles(null);return;}setError(null);setInstructionFiles(e.target.files)}}/>
          {instructionFiles?.length ? <div className="selected-files">{Array.from(instructionFiles).map((file,i)=><span key={`${file.name}-${i}`}>{file.name}</span>)}<button type="button" onClick={()=>{setInstructionFiles(null);if(instructionRef.current)instructionRef.current.value="";}}>Remove files</button></div> : null}
          <label className="field-label">What would you like to learn?</label>
          <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} rows={3}/>
          <button className="analyze" type="submit" disabled={busy || (!url.trim() && !reviewFile)}>{busy ? <LoaderCircle size={17} className="spin"/> : <ArrowUp size={17}/>} {busy ? status : reviewFile ? "Analyze uploaded reviews" : "Collect & analyze reviews"}</button>
          {error && <div className="error-box" role="alert"><b>{errorTitles[error.code] || "Task could not complete"}</b><code>{error.code.replaceAll("_", " ")}</code><p>{error.message}</p>{error.action && <small>Suggested action: {error.action}</small>}</div>}
          <div className="disclaimer">Collected review count may be lower than requested. AI labels are estimates; review original evidence before making decisions.</div>
        </form>

        {result && <section className="results">
          <div className="results-head"><div><div className="eyebrow">ANALYSIS COMPLETE</div><h2>Review intelligence report</h2><p>{result.review_count_collected} reviews collected · ASIN {result.asin} · {result.source_mode.replaceAll("_", " ")}</p></div><div className="export-group"><button className="export" onClick={downloadReport}><Download size={15}/> Report</button><button className="export" onClick={()=>downloadDataset("csv")}><FileSpreadsheet size={15}/> CSV</button><button className="export" onClick={()=>downloadDataset("xlsx")}><FileSpreadsheet size={15}/> XLSX</button></div></div>
          <div className="metric-row"><div className="metric"><span>Reviews collected</span><b>{result.review_count_collected}</b><small>Requested up to {result.requested_review_count}</small></div><div className="metric"><span>Positive / neutral / negative</span><b className="sentiment-metric">{sentimentCounts.positive || 0} / {sentimentCounts.neutral || 0} / {sentimentCounts.negative || 0}</b><small>AI classification of collected reviews</small></div><div className="metric"><span>Filtered results</span><b>{filteredReviews.length}</b><small>Ready to export</small></div></div>
          <article className="report"><div className="report-title"><Sparkles size={17}/><b>AI findings</b></div><pre>{result.analysis}</pre><div className="evidence-note">{result.notice}</div></article>
          <section className="review-section">
            <div className="review-section-head"><div><h2>Collected reviews</h2><p>Combine filters to inspect the exact subset you want to export.</p></div><button className="clear-filters" onClick={resetFilters}><X size={14}/> Clear filters</button></div>
            <div className="filters">
              <div className="filter-block full"><label><Search size={14}/> Search review text</label><input value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="e.g. broke, expensive, comfortable"/></div>
              <div className="filter-block full"><label><Star size={14}/> Star rating</label><div className="star-filter">{[1,2,3,4,5].map(n=><button key={n} className={stars.includes(n)?"selected":""} onClick={()=>setStars(prev=>prev.includes(n)?prev.filter(s=>s!==n):[...prev,n])}>{n} <Star size={12} fill="currentColor"/></button>)}</div></div>
              <div className="filter-block"><label>Sentiment</label><select className="select" value={sentiment} onChange={e=>setSentiment(e.target.value)}><option value="all">All sentiment</option><option value="positive">Positive</option><option value="neutral">Neutral</option><option value="negative">Negative</option></select></div>
              <div className="filter-block"><label>Feedback type</label><select className="select" value={reviewType} onChange={e=>setReviewType(e.target.value)}><option value="all">All reviews</option><option value="pros">Contains pros</option><option value="cons">Contains cons</option></select></div>
              <div className="filter-block"><label>Product aspect</label><select className="select" value={aspect} onChange={e=>setAspect(e.target.value)}><option value="all">All aspects</option>{allAspects.map(a=><option key={a} value={a}>{a}</option>)}</select></div>
              <div className="filter-block"><label>Verified purchase</label><label className="check-label"><input type="checkbox" checked={verifiedOnly} onChange={e=>setVerifiedOnly(e.target.checked)}/> Verified only</label></div>
              <div className="filter-block"><label>Date from</label><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></div>
              <div className="filter-block"><label>Date to</label><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></div>
            </div>
            <div className="table-wrap"><table className="review-table"><thead><tr><th>Rating</th><th>Review</th><th>Sentiment</th><th>Aspects</th><th>Pros / cons</th><th>Date</th></tr></thead><tbody>
              {filteredReviews.map((r,i)=><tr key={`${r.review_id}-${i}`}><td><span className="rating-pill">{r.rating ? `${r.rating} ★` : "N/A"}</span></td><td className="review-cell"><b>{r.review_title || "Customer review"}</b><p>{r.review_text}</p>{(r.verified_purchase === true || String(r.verified_purchase).toLowerCase()==="true" || String(r.verified_purchase).toLowerCase().includes("verified")) && <small className="verified">Verified purchase</small>}</td><td><span className={`sentiment-pill ${r.sentiment}`}>{r.sentiment}</span></td><td>{(r.aspects || []).join(", ") || "—"}</td><td>{r.pros?.length ? <div className="pro-text">+ {r.pros.join("; ")}</div>:null}{r.cons?.length ? <div className="con-text">− {r.cons.join("; ")}</div>:null}{!r.pros?.length&&!r.cons?.length?"—":null}</td><td>{r.review_date || "—"}</td></tr>)}
              {!filteredReviews.length && <tr><td colSpan={6} className="empty">No reviews match these filters.</td></tr>}
            </tbody></table></div>
            <div className="table-footer"><span><Filter size={14}/> Showing {filteredReviews.length} of {result.reviews.length} collected reviews</span><span>Exports use the currently filtered selection.</span></div>
          </section>
        </section>}
      </div>
      <footer className="status"><span><i/> {status}</span><span>URL-first collection · Supervised analysis</span></footer>
    </section>
  </main>;
}
