import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { SearchPage } from './pages/SearchPage'
import { StoresPage } from './pages/StoresPage'
import { RecordPage } from './pages/RecordPage'
import { WishlistPage } from './pages/WishlistPage'
import { StatsPage } from './pages/StatsPage'

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/stores" element={<StoresPage />} />
        <Route path="/record/:id" element={<RecordPage />} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/stats" element={<StatsPage />} />
      </Route>
    </Routes>
  )
}
