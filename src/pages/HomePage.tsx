import { SearchBar } from '../components/SearchBar'

export function HomePage() {
  return (
    <div className="relative min-h-[calc(100vh-11rem)] overflow-hidden flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-accent/5 via-bg-primary to-bg-primary" />
      <div className="absolute top-24 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
      <div className="absolute bottom-16 left-1/4 w-72 h-72 bg-teal/5 rounded-full blur-3xl" />

      <div className="relative w-full max-w-4xl text-center">
        <h1 className="text-4xl md:text-6xl font-black text-text-primary mb-4 leading-tight">
          חיפוש תקליטים
          <br />
          <span className="text-accent">פשוט ומהיר</span>
        </h1>
        <p className="text-text-secondary text-lg mb-10">הקלידו אמן, אלבום או ז'אנר כדי להתחיל</p>

        <div className="max-w-3xl mx-auto">
          <SearchBar large autoFocus />
        </div>
      </div>
    </div>
  )
}
