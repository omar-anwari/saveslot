import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
    return (
        <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
            <h1 className="text-2xl font-semibold tracking-tight">SaveSlot</h1>
            <p className="mt-1 text-sm text-muted">Sign in to continue.</p>
            <Suspense fallback={null}>
                <LoginForm />
            </Suspense>
        </main>
    );
}