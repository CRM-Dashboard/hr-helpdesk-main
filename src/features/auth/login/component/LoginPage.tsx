import React, { useState } from "react";
import { User, Lock } from "lucide-react";

import FormInput from "./FormInput";
import Logo from "./Logo";
import { useToast } from "@/hooks/use-toast";
const LoginPage = ({ onSubmit, isLoading }) => {
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !password) {
      toast({
        title: "Error",
        description: "Please enter both username and password",
        variant: "destructive",
      });
      return;
    }

    // setIsLoading(true);

    await onSubmit({ username, password });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm mx-auto">
        <div className="flex flex-col items-center space-y-2 animate-fade-in">
          {/* Logo */}
          {/* <div className="mb-1">
            <Logo />
          </div> */}

          {/* Header */}
          <div className="text-center space-y-2 mb-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Welcome to Gerahub
            </h1>

            <p className="text-sm text-muted-foreground">
              Enter your{" "}
              <strong className="font-semibold text-white bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-2 py-0.5 rounded-md shadow-sm">
                SAP Credentials
              </strong>{" "}
              to sign in to your account
            </p>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="w-full space-y-4 animate-scale-in"
          >
            <div className="space-y-3">
              <FormInput
                type="text"
                placeholder="Enter SAP Username"
                value={username}
                onChange={setUsername}
                icon={<User size={18} />}
              />

              <FormInput
                type="password"
                placeholder="Enter SAP Password"
                value={password}
                onChange={setPassword}
                icon={<Lock size={18} />}
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="form-button"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    <span>Signing in...</span>
                  </div>
                ) : (
                  <span>Sign in</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
