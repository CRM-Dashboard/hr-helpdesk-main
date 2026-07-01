import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar,
  Clock,
  User,
  Tag,
  FileText,
  AlertCircle,
  Layers,
  UserCog,
} from "lucide-react";
import { HRSpocData } from "../../types/hrSpocTypes";
import { getSSOCredentials } from "@/utils/storage";
import { getEmployeeInfo } from "../../api/EmployeeInfo";
import SelectField from "@/components/SelectField";
import { PRIORITY_LIST, STATUS_LIST } from "../../constant/constant";
import { status } from "../../types/helpdeskDataTypes";

interface EditTicketDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDetail: any;
  // onSave returns true on success (keep changes), false on failure (revert)
  onSave: (updated: any) => Promise<boolean>;
  onSaved?: (updated: any) => void;
  hrSpocData: HRSpocData;
  statusList: status[];
}

export function EditTicketDetailDialog({
  open,
  onOpenChange,
  initialDetail,
  onSave,
  onSaved,
  hrSpocData,
  statusList = [],
}: EditTicketDetailDialogProps) {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const [category, setCategory] = useState(""); // "Talent Acquisition"
  const [subCategory, setSubCategory] = useState(""); // "Employee Referral / IJP"
  const [assignee, setAssignee] = useState("");

  const categories = Object.keys(hrSpocData || {});
  const subCategories = category
    ? Object.keys(hrSpocData?.[category] || {})
    : [];

  // Initialize category and subCategory from initialDetail when dialog opens
  useEffect(() => {
    if (open && initialDetail) {
      const initCategory = initialDetail.category || categories[0] || ""; // "Talent Acquisition"
      const availableSubCategories = hrSpocData?.[initCategory]
        ? Object.keys(hrSpocData[initCategory])
        : [];
      const initSubCategory =
        initialDetail.subCategory || availableSubCategories[0] || ""; // "Employee Referral / IJP"

      setCategory(initCategory);
      setSubCategory(initSubCategory);
      setField("category", initCategory);
      setField("subCategory", initSubCategory);
    }
  }, [open, initialDetail]);

  // Update assignee when category or subCategory changes
  useEffect(() => {
    if (category && subCategory && hrSpocData[category]?.[subCategory]) {
      const spocDetails = hrSpocData[category][subCategory];
      setAssignee(spocDetails.spocId);
      setField("assigned", spocDetails.spocId);
    }
  }, [category, subCategory, hrSpocData]);

  const handleCategoryChange = (newCategory: string) => {
    setCategory(newCategory);
    setField("category", newCategory);

    const firstSubCategory = Object.keys(hrSpocData?.[newCategory] || {})[0];

    setSubCategory(firstSubCategory);
    setField("subCategory", firstSubCategory);
  };

  const handleSubCategoryChange = (newSubCategory: string) => {
    console.log("handleSubCategoryChange: newSubCategory -->", newSubCategory);

    setSubCategory(newSubCategory);
    setField("subCategory", newSubCategory);
  };

  const handleStatusChange = (selectedValue: string) => {
    // Find the selected status from STATUS_LIST
    const selectedStatus = statusList.find(
      (status) => status.status === selectedValue,
    );

    if (selectedStatus) {
      // Set both status (value) and statusTxt (label)
      setField("status", selectedStatus.status);
      setField("statusTxt", selectedStatus.statusTxt);
    }
  };

  useEffect(() => {
    if (open) {
      setForm({ ...(initialDetail || {}) });
    }
  }, [open, initialDetail]);

  const setField = (key: string, value: any) => {
    setForm((prev: any) => ({ ...(prev || {}), [key]: value }));
  };

  // Auto-capture End date when status is set to Closed
  useEffect(() => {
    if (form?.statusTxt === "Closed") {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const todayStr = `${yyyy}-${mm}-${dd}`;

      setForm((prev: any) => {
        // if (prev?.endDt) return prev;
        return { ...(prev || {}), endDt: todayStr };
      });
    }
  }, [form?.statusTxt]);

  // console.log("EditTicketDetailDialog: form data -->", form);

  const getEmployeeName = async () => {
    try {
      const SSO_EMAIL = getSSOCredentials();
      const response = await getEmployeeInfo(SSO_EMAIL);
      return response?.EmployeeDetails[0]?.employeeName;
    } catch (error) {
      console.error("Failed to get employee info:", error);
      throw new Error(
        `Failed to fetch the employee info data: ${error.message}`,
      );
    }
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      const ok = await onSave(form);
      if (!ok) return; // keep dialog open for retry
      onSaved?.(form);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="space-y-2 pb-4 border-b">
          <DialogTitle className="text-2xl font-semibold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Edit Ticket Details
          </DialogTitle>
          <DialogDescription className="text-base">
            Update ticket information and assignment details
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1 py-4">
          <div className="space-y-6">
            {/* Category Assignment Section */}
            <Card className="border-2 border-primary/20 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Layers className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">
                    Category & Assignment
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Category */}
                  <div className="space-y-2">
                    <Label
                      htmlFor="category"
                      className="flex items-center gap-2 text-sm font-medium"
                    >
                      <Tag className="h-4 w-4" />
                      Category
                    </Label>
                    <Select
                      value={category}
                      onValueChange={handleCategoryChange}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories?.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* SubCategory */}
                  <div className="space-y-2">
                    <Label
                      htmlFor="subCategory"
                      className="flex items-center gap-2 text-sm font-medium"
                    >
                      <Layers className="h-4 w-4" />
                      Sub-Category
                    </Label>
                    <Select
                      value={subCategory}
                      onValueChange={handleSubCategoryChange}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select sub-category" />
                      </SelectTrigger>
                      <SelectContent>
                        {subCategories?.map((subCat) => (
                          <SelectItem key={subCat} value={subCat}>
                            {subCat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Assignee */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <UserCog className="h-4 w-4" />
                      Assigned To
                    </Label>
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-200 rounded-lg">
                      <User className="h-4 w-4 text-blue-600" />
                      <span className="text-blue-900 font-medium">
                        {assignee || "Not assigned"}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="transportId"
                      className="text-sm font-medium"
                    >
                      #Transport ID
                    </Label>
                    <Textarea
                      id="remark"
                      value={form.transportId || ""}
                      onChange={(e) => setField("transportId", e.target.value)}
                      placeholder="Transport ID..."
                      className="min-h-[30px] resize-none"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <AlertCircle className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">Status & Priority</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <SelectField
                      id="statusTxt"
                      label="Status"
                      value={form.status || ""}
                      onChange={handleStatusChange}
                      // options={STATUS_LIST}
                      options={statusList.map((s) => ({
                        value: s.status,
                        label: s.statusTxt,
                      }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <SelectField
                      id="priority"
                      label="Priority"
                      value={(form.priority || "").toUpperCase()}
                      onChange={(val) => setField("priority", val)}
                      options={PRIORITY_LIST}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Description Section */}
            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">
                    Description & Remarks
                  </h3>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="description"
                      className="text-sm font-medium"
                    >
                      Ticket Description
                    </Label>
                    <Textarea
                      id="description"
                      value={form.ticketDesc || ""}
                      onChange={(e) => setField("ticketDesc", e.target.value)}
                      placeholder="Enter detailed ticket description..."
                      className="min-h-[100px] resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="remark" className="text-sm font-medium">
                      Additional Remarks
                    </Label>
                    <Textarea
                      id="remark"
                      value={form.remark || ""}
                      onChange={(e) => setField("remark", e.target.value)}
                      placeholder="Add any additional remarks or notes..."
                      className="min-h-[80px] resize-none"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Timeline Section */}
            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">Timeline</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="planStartDt"
                      className="text-sm font-medium"
                    >
                      Planned Start Date
                    </Label>
                    <Input
                      id="planStartDt"
                      type="date"
                      value={form.planStartDt || ""}
                      onChange={(e) => setField("planStartDt", e.target.value)}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="planEndDt" className="text-sm font-medium">
                      Planned End Date
                    </Label>
                    <Input
                      id="planEndDt"
                      type="date"
                      value={form.planEndDt || ""}
                      onChange={(e) => setField("planEndDt", e.target.value)}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="startDt" className="text-sm font-medium">
                      Actual Start Date
                    </Label>
                    <Input
                      id="startDt"
                      type="date"
                      value={form.startDt || ""}
                      onChange={(e) => setField("startDt", e.target.value)}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="endDt" className="text-sm font-medium">
                      Actual End Date
                      {/* {form?.statusTxt === "Closed" && (
                        <Badge variant="secondary" className="ml-2">
                          Auto-filled
                        </Badge>
                      )} */}
                    </Label>
                    <Input
                      id="endDt"
                      type="date"
                      value={form.endDt || ""}
                      // disabled={form?.statusTxt !== "Closed"}
                      onChange={(e) => setField("endDt", e.target.value)}
                      className="w-full disabled:opacity-50"
                    />
                    {/* {form?.statusTxt !== "Closed" && (
                      <p className="text-xs text-muted-foreground mt-1">
                        End date is enabled only when status is set to "Closed"
                      </p>
                    )} */}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t mt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="min-w-[100px]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="min-w-[100px] bg-primary hover:bg-primary/90"
          >
            {saving ? (
              <>
                <Clock className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default EditTicketDetailDialog;
