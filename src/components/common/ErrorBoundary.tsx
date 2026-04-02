import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-6">
          <div className="text-4xl">⚠️</div>
          <h2 className="font-semibold text-gray-700">Något gick fel</h2>
          <p className="text-sm text-red-400 font-mono max-w-sm break-words">
            {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium"
          >
            Försök igen
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
