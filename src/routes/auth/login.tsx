import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/auth/login')({ component: Login })

function Login() {
  return (
    <main className="">
      <h1>Login</h1>
    </main>
  )
}
