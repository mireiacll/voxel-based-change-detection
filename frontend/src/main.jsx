import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles/viewer.css'
import AuthGate from './components/AuthGate'

createRoot(document.getElementById('root')).render(<AuthGate />)
