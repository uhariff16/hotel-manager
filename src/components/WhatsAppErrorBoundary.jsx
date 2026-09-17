import React from "react";
export class WhatsAppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("WhatsApp Modal Error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "20px", background: "#fee2e2", color: "#b91c1c", zIndex: 9999, position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", borderRadius: "8px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>
          <h3>WhatsApp Modal Crashed</h3>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '300px', overflowY: 'auto' }}>
            {this.state.error?.toString()}
          </pre>
          <button onClick={() => this.setState({ hasError: false })} style={{ marginTop: "10px", padding: "5px 10px" }}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}
