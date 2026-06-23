import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { hrSpocData } from "../mock/mockData";
import { useHelpdesk } from "../context/HelpdeskContext";

function HRRequestForm() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { addRequest } = useHelpdesk();
  const [category, setCategory] = useState("Talent Acquisition");
  const [subCategory, setSubCategory] = useState("Employee Referral / IJP");
  const [requester, setRequester] = useState("testUser@gera.in");
  const [request, setRequest] = useState("Test Request");
  const [requestDescription, setRequestDescription] = useState("");
  const [status] = useState("New");
  const [assignee, setAssignee] = useState("testHr@gera.in");

  useEffect(() => {
    if (category && subCategory && hrSpocData[category]?.[subCategory]) {
      const spocName = hrSpocData[category][subCategory];
      const email = spocName.toLowerCase().replace(" ", ".") + "@gera.in";
      setAssignee(email);
    }
  }, [category, subCategory]);

  const handleCategoryChange = (e) => {
    const newCategory = e.target.value;
    setCategory(newCategory);
    const firstSubCategory = Object.keys(hrSpocData[newCategory])[0];
    setSubCategory(firstSubCategory);
  };

  const categories = Object.keys(hrSpocData);
  const subCategories = category ? Object.keys(hrSpocData[category]) : [];

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const req = addRequest({
      employeeEmail: requester,
      category,
      subCategory,
      title: request,
      description: requestDescription,
      assigneeEmail: assignee,
    });
    toast({
      title: "Request submitted",
      description: `Ticket ${req.id} created.`,
    });
    navigate("/helpdesk");
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-0">
      <form
        onSubmit={onSubmit}
        className="bg-white rounded-lg border w-full max-w-2xl overflow-hidden"
      >
        {/* Form Content */}
        <div className="p-6 space-y-5">
          {/* Category */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Category
            </label>
            <select
              value={category}
              onChange={handleCategoryChange}
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all outline-none"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* SubCategory */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              SubCategory
            </label>
            <select
              value={subCategory}
              onChange={(e) => setSubCategory(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all outline-none"
            >
              {subCategories.map((subCat) => (
                <option key={subCat} value={subCat}>
                  {subCat}
                </option>
              ))}
            </select>
          </div>

          {/* Requester */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Requester
            </label>
            <select
              value={requester}
              onChange={(e) => setRequester(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all outline-none"
            >
              <option value="testUser@gera.in">testUser@gera.in</option>
            </select>
          </div>

          {/* Request */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Request
            </label>
            <input
              type="text"
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all outline-none"
            />
          </div>

          {/* Request Description */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Request Description
            </label>
            <textarea
              value={requestDescription}
              onChange={(e) => setRequestDescription(e.target.value)}
              rows={4}
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all outline-none resize-none"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Status
            </label>
            <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700">
              {status}
            </div>
          </div>

          {/* Assignee */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Assignee
            </label>
            <div className="px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 font-medium">
              {assignee}
            </div>
          </div>

          {/* Response Summary */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              ResponseSummary
            </label>
            <textarea
              rows={3}
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all outline-none resize-none"
            />
          </div>

          {/* Checkbox */}
          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-2 focus:ring-purple-400"
              />
              <span className="text-sm font-medium text-gray-700">
                Is Request Closed On Time?
              </span>
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit">Submit</Button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default HRRequestForm;
