import { Component } from 'react'

/**
 * Catches render-time errors in descendant components. React doesn't
 * support error boundaries via hooks; this must be a class.
 *
 * Errors are logged to console with a tag. If you wire a real error
 * reporter (Sentry, etc.) later, do it in componentDidCatch.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return (
      <section className="surface active">
        <div className="status-panel">
          <p className="eyebrow error">▸ The Tape Caught</p>
          <p className="status-panel-body">
            Something tore on this page. The tape jammed.
          </p>
          <button className="btn primary" onClick={this.reset}>
            Try again
          </button>
        </div>
      </section>
    )
  }
}
