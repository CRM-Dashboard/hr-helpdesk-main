import { useEffect, useState, lazy, Suspense } from "react";
import api from "../api/authAPI";
// const LoginPage = lazy(() => import("../component/LoginPage"));
import { useNavigate } from "react-router-dom";

// import FullLoading from "../FullLoading";
import { useToast } from "@/hooks/use-toast";
import LoadingOverlay from "@/components/ui/loading-overlay";
import LoginPage from "../component/LoginPage";
import { base_URL } from "@/services/sapClient";
import { STORAGE_KEY } from "@/constant";

const LoginContainer = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleLogin = async (data: any) => {
    try {
      const meta = base_URL; //import.meta.env.VITE_APP_SERVER_URL;
      const apiUrl = meta + "/api/loggedInUserDetails";

      const { username, password } = data;
      const formData = new FormData();
      formData.append("userName", username);
      formData.append("password", password);

      setIsLoading(true);
      const res = (await api.post(apiUrl, formData)).data;

      if (res[0].user[0]) {
        sessionStorage.setItem(
          STORAGE_KEY.CredUser,
          JSON.stringify(res[0]?.user[0]),
        );
        sessionStorage.setItem(
          STORAGE_KEY.CredRoles,
          JSON.stringify(res[0]?.roles),
        );
        sessionStorage.setItem(
          STORAGE_KEY.CredentialSecret,
          JSON.stringify({ userName: username, passWord: password }),
        );
        toast({
          title: "Success",
          description: "You've successfully logged in",
        });
        navigate("/dashboard");
      } else {
        throw new Error("Login with Correct Credentials");
      }
    } catch (error: any) {
      // Log the error and handle it (e.g., display a message to the user)
      console.error("Error during login:", error);

      toast({
        title: "Error",
        description: "Login failed: Please check your username and password.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const credentials = JSON.parse(
    sessionStorage.getItem(STORAGE_KEY.CredentialSecret),
  );
  const checkUserIsLogged = () => {
    if (credentials && credentials.userName && credentials.passWord) {
      navigate("/dashboard");
      toast({
        description:
          "User is already logged in. Please log out to switch users.",
        variant: "destructive", // This could be an error style for the toast
      });
    }
  };
  useEffect(() => {
    checkUserIsLogged();
  }, [credentials]);

  return (
    <>
      {/* <Suspense fallback={<LoadingOverlay open={isLoading} />}> */}
      <LoginPage onSubmit={handleLogin} isLoading={isLoading} />
      {/* </Suspense> */}
    </>
  );
};

export default LoginContainer;
