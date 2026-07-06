import { Route, Routes } from "react-router-dom";
import { Login } from "./layouts/login";
import { ForgotPasswordPage } from "./layouts/forgot-password.page";

export const PublicRoutes = () => {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="*" element={<Login />} />
        </Routes>
    );
};
