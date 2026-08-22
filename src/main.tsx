import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initClientLogging } from './utils/clientLog'
import './index.css'

initClientLogging()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
