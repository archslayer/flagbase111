// app/adminfb/users/page.tsx
// User management page

'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, Users as UsersIcon } from 'lucide-react'

interface User {
  wallet: string
  createdAt: string
  lastLoginAt?: string
  referralCount: number
  questCount: number
  attackCount: number
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState('')

  const loadUsers = async (pageNum: number, searchTerm: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: '50',
      })
      if (searchTerm) {
        params.append('search', searchTerm)
      }

      const res = await fetch(`/api/adminfb/users?${params}`)
      const data = await res.json()

      if (data.ok) {
        setUsers(data.users)
        setTotalPages(data.pagination.totalPages)
      }
    } catch (err) {
      console.error('Failed to load users:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers(page, search)
  }, [page])

  const handleSearch = () => {
    setPage(1)
    loadUsers(1, search)
  }

  return (
    <div>
      <h1 style={{
        fontSize: '2rem',
        fontWeight: 'bold',
        color: 'var(--text-primary)',
        marginBottom: '2rem',
      }}>
        User Management
      </h1>

      <Card style={{ marginBottom: '2rem' }}>
        <CardHeader>
          <CardTitle>Search Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearch()
                }
              }}
              placeholder="Search by wallet address..."
              style={{ flex: 1 }}
            />
            <Button onClick={handleSearch}>
              <Search size={16} style={{ marginRight: '0.5rem' }} />
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div style={{ color: 'var(--text-primary)', textAlign: 'center', padding: '2rem' }}>
          Loading users...
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <UsersIcon size={20} />
                Users ({users.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--stroke)' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-secondary)' }}>Wallet</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-secondary)' }}>Created</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-secondary)' }}>Last Login</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-secondary)' }}>Referrals</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-secondary)' }}>Quests</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-secondary)' }}>Attacks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.wallet} style={{ borderBottom: '1px solid var(--stroke)' }}>
                        <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.875rem' }}>
                          {user.wallet}
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                          {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : '-'}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                          {user.referralCount}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                          {user.questCount}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                          {user.attackCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {users.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No users found
                </div>
              )}
            </CardContent>
          </Card>

          {totalPages > 1 && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '0.5rem',
              marginTop: '1rem',
            }}>
              <Button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                variant="outline"
              >
                Previous
              </Button>
              <span style={{
                padding: '0.5rem 1rem',
                color: 'var(--text-primary)',
              }}>
                Page {page} of {totalPages}
              </span>
              <Button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                variant="outline"
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

