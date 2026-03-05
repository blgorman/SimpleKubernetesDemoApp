import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/items')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => setItems(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  function fetchItem(id) {
    setSelected(null)
    fetch(`/api/items/${id}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => setSelected(data))
      .catch(err => setError(err.message))
  }

  return (
    <div className="container">
      <h1>Simple Kubernetes Demo</h1>
      <p className="subtitle">React frontend + .NET 8 backend</p>

      {loading && <p className="status">Loading items...</p>}
      {error   && <p className="error">Error: {error}</p>}

      {!loading && !error && (
        <>
          <h2>All Items</h2>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Description</th>
                <th>Price</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.name}</td>
                  <td>{item.description}</td>
                  <td>${item.price.toFixed(2)}</td>
                  <td>
                    <button onClick={() => fetchItem(item.id)}>Details</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {selected && (
            <div className="detail-card">
              <h2>Item Detail (GET /api/items/{selected.id})</h2>
              <pre>{JSON.stringify(selected, null, 2)}</pre>
              <button onClick={() => setSelected(null)}>Close</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default App
