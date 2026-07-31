import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App, { Credit } from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Credit />
  </StrictMode>,
)
