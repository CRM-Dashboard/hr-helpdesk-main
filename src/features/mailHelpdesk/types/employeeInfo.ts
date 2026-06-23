export interface EmployeeInfo {
  mandt: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  startDate: string;
  endDate: string;
  location: string;
  grade: string;
  department: string;
  managerId: string;
  managerName: string;
  crmInd: string; // "X" means - To show in project list
  billInd: string; // ""; means - Not to show in project list
  itInd: string;
  travelInd: string;
  hrInd: string;
  adminInd: string;
}

export interface EmployeeInfoDetail {
  EmployeeDetails: EmployeeInfo[];
}
