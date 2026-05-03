"use client";

import React, {
    createContext,
    useContext,
    useEffect,
    useState,
    ReactNode,
} from "react";

const LOCAL_USER = { id: "local-user", email: "local@localhost" };

interface User {
    id: string;
    email: string;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    authLoading: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(LOCAL_USER);
    const [authLoading, setAuthLoading] = useState(false);

    useEffect(() => {
        const ensureProfile = async () => {
            const apiBase =
                process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
            await fetch(`${apiBase}/user/profile`, {
                method: "POST",
                headers: { Authorization: `Bearer local-token` },
            }).catch((e) => {
                console.log(e);
            });
        };
        ensureProfile();
    }, []);

    const signOut = async () => {
        // No-op in single-player mode
        setUser(LOCAL_USER);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                isAuthenticated: true,
                authLoading,
                signOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
