import { END_POINTS, sapClientBase } from "@/services/sapClient";
import { EmployeeInfoDetail } from "../types/employeeInfo";

export async function getEmployeeInfo(
  empMail?: string
): Promise<EmployeeInfoDetail> {
  try {
    const formData = new FormData();

    // Add required metadata fields
    formData.append("emailId", empMail ? empMail : "");
    // formData.append("employeeId", "GD1344"); // GD1344 GD1988

    const response = await sapClientBase.post(
      END_POINTS.GET_EMPLOYEE_INFO,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );
    // const response = await axios.get(
    //   `http://115.124.113.252:8000/sap/bc/parking/employee?sap-client=250&emailId=${empMail}`
    // );

    return response.data;
  } catch (error) {
    console.error("Failed to get employee info:", error);
    throw new Error(`Failed to fetch the employee info data: ${error.message}`);
  }
}
