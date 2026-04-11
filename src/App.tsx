import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { SearchPage } from './pages/SearchPage'
import { StoresPage } from './pages/StoresPage'
import { RecordPage } from './pages/RecordPage'
import { WishlistPage } from './pages/WishlistPage'

function LegacySearchRedirect() {
  const location = useLocation()
  return <Navigate to={{ pathname: '/', search: location.search }} replace />
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<SearchPage />} />
        <Route path="/search" element={<LegacySearchRedirect />} />
        <Route path="/stores" element={<StoresPage />} />
        <Route path="/record/:id" element={<RecordPage />} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/stats" element={<Navigate to="/stores" replace />} />
      </Route>
    </Routes>
  )
}
