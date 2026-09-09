import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    const isChunkLoadFailed = error?.message?.match(/Failed to fetch dynamically imported module/i) || error?.message?.match(/Importing a module script failed/i);
    
    if (isChunkLoadFailed) {
      console.warn('Chunk load error detected, reloading page to fetch new version...');
      const hasReloaded = sessionStorage.getItem('chunk_load_reload');
      if (!hasReloaded) {
        sessionStorage.setItem('chunk_load_reload', 'true');
        window.location.reload(true);
        return;
      } else {
        sessionStorage.removeItem('chunk_load_reload');
      }
    }
    
    console.error('ErrorBoundary caught an error', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Something went wrong loading this page.</h2>
          <button onClick={() => window.location.reload()} style={{ padding: '0.5rem 1rem', marginTop: '1rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
