import React from 'react'

export default class IslandErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[IslandErrorBoundary] React island crash:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card-raised p-6 border border-[var(--color-blood)] my-4 flex flex-col items-center text-center gap-3">
          <span className="font-mono text-xs font-bold uppercase tracking-wider px-2 py-0.5 border border-[var(--color-blood)] text-[var(--color-blood)]">
            ⚠️ SIGNAL LOST
          </span>
          <h4 className="font-['Fraunces'] font-bold text-sm text-[var(--color-bone)]">
            This component encountered a temporal fault.
          </h4>
          {this.state.error?.message && (
            <p className="font-mono text-xs text-[var(--color-ash)] max-w-md bg-[var(--color-void)] border border-[var(--color-line)] p-2 truncate">
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={this.handleReset}
            className="btn-vhs mt-2"
          >
            Re-establish Link
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
