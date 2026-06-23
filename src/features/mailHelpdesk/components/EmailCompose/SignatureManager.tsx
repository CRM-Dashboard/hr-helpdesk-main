import React, { useState, useRef, useEffect, useMemo } from "react";
import ReactQuill, { Quill } from "react-quill";
import "react-quill/dist/quill.snow.css";
import { toast } from "sonner";
import { Save, Trash2, Edit, Image as ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

interface Signature {
  id: string;
  name: string;
  content: string;
}

interface SignatureManagerProps {
  onSelectSignature: (signature: string) => void;
}

// Register custom fonts and sizes with Quill for signature editor
try {
  const Font = Quill.import("formats/font") as any;
  const Size = Quill.import("formats/size") as any;

  if (Font && !Font.whitelist) {
    Font.whitelist = [
      "arial",
      "calibri",
      "times",
      "courier",
      "tahoma",
      "verdana",
    ];
    Quill.register(Font, true);
  }

  if (Size && !Size.whitelist) {
    Size.whitelist = [
      "8px",
      "9px",
      "10px",
      "11px",
      "12px",
      "14px",
      "16px",
      "18px",
      "20px",
      "22px",
      "24px",
    ];
    Quill.register(Size, true);
  }
} catch (error) {
  console.error("Font/Size registration skipped for signature editor:", error);
}

const SignatureManager: React.FC<SignatureManagerProps> = ({
  onSelectSignature,
}) => {
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [newSignatureName, setNewSignatureName] = useState("");
  const [newSignatureContent, setNewSignatureContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const quillRef = useRef<ReactQuill>(null);

  // Quill modules configuration for signature editor
  const modules = useMemo(
    () => ({
      toolbar: {
        container: [
          [
            {
              font: [
                "arial",
                "calibri",
                "times",
                "courier",
                "tahoma",
                "verdana",
              ],
            },
          ],
          [
            {
              size: [
                "8px",
                "9px",
                "10px",
                "11px",
                "12px",
                "14px",
                "16px",
                "18px",
                "20px",
                "22px",
                "24px",
              ],
            },
          ],
          ["bold", "italic", "underline"],
          [{ color: [] }, { background: [] }],
          [{ list: "ordered" }, { list: "bullet" }],
          [{ align: [] }],
          ["link", "image"],
          ["clean"],
        ],
      },
      clipboard: {
        matchVisual: false,
      },
    }),
    []
  );

  const formats = [
    "font",
    "size",
    "bold",
    "italic",
    "underline",
    "list",
    "bullet",
    "align",
    "link",
    "image",
    "color",
    "background",
  ];

  // Load signatures from localStorage on component mount
  useEffect(() => {
    const savedSignatures = localStorage.getItem("emailSignatures");
    if (savedSignatures) {
      try {
        setSignatures(JSON.parse(savedSignatures));
      } catch (error) {
        console.error("Error parsing signatures from localStorage:", error);
      }
    }
  }, []);

  // Save signatures to localStorage whenever they change
  useEffect(() => {
    if (signatures.length > 0) {
      localStorage.setItem("emailSignatures", JSON.stringify(signatures));
    }
  }, [signatures]);

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (files && quillRef.current) {
      const quill = quillRef.current.getEditor();
      const range = quill.getSelection();

      for (const file of Array.from(files)) {
        if (file.type.startsWith("image/")) {
          try {
            const dataUrl = await convertFileToBase64(file);
            // Insert image directly into the editor using base64
            if (range) {
              quill.insertEmbed(range.index, "image", dataUrl);
              quill.setSelection(range.index + 1, 0);
            } else {
              const length = quill.getLength();
              quill.insertEmbed(length - 1, "image", dataUrl);
            }
            toast.success(`Image added: ${file.name}`);
          } catch (error) {
            toast.error(`Failed to process image: ${file.name}`);
          }
        } else {
          toast.error("Please select only image files");
        }
      }
    }
    // Reset the input
    if (event.target) {
      event.target.value = "";
    }
  };

  const insertImage = () => {
    fileInputRef.current?.click();
  };

  const handleContentChange = (value: string) => {
    setNewSignatureContent(value);
  };

  const handleSaveSignature = () => {
    if (
      !newSignatureName.trim() ||
      !newSignatureContent.trim() ||
      newSignatureContent === "<p><br></p>"
    ) {
      toast.error("Please fill in both name and content");
      return;
    }

    if (editingId) {
      setSignatures((prev) =>
        prev.map((sig) =>
          sig.id === editingId
            ? { ...sig, name: newSignatureName, content: newSignatureContent }
            : sig
        )
      );
      toast.success("Signature updated");
    } else {
      const newSignature: Signature = {
        id: Date.now().toString(),
        name: newSignatureName,
        content: newSignatureContent,
      };
      setSignatures((prev) => [...prev, newSignature]);
      toast.success("Signature saved");
    }

    setNewSignatureName("");
    setNewSignatureContent("");
    setEditingId(null);
    setIsCreating(false);
  };

  const handleEditSignature = (signature: Signature) => {
    setNewSignatureName(signature.name);
    setNewSignatureContent(signature.content);
    setEditingId(signature.id);
    setIsCreating(true);

    // Set content in Quill editor after a short delay to ensure it's mounted
    setTimeout(() => {
      if (quillRef.current) {
        quillRef.current.getEditor().root.innerHTML = signature.content;
      }
    }, 100);
  };

  const handleDeleteSignature = (id: string) => {
    const updatedSignatures = signatures.filter((sig) => sig.id !== id);
    setSignatures(updatedSignatures);

    // Update localStorage
    if (updatedSignatures.length > 0) {
      localStorage.setItem(
        "emailSignatures",
        JSON.stringify(updatedSignatures)
      );
    } else {
      localStorage.removeItem("emailSignatures");
    }

    toast.success("Signature deleted");
  };

  const handleUseSignature = (content: string) => {
    onSelectSignature(content);
    toast.success("Signature added to email");
  };

  const cancelEditing = () => {
    setNewSignatureName("");
    setNewSignatureContent("");
    setEditingId(null);
    setIsCreating(false);
  };

  // Create a preview of signature content (strip HTML tags for preview)
  const getPreviewText = (content: string) => {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = content;
    const text = tempDiv.textContent || tempDiv.innerText || "";
    return text.length > 50 ? text.substring(0, 50) + "..." : text;
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Email Signatures</h3>
        {signatures.length < 1 && (
          <Button
            onClick={() => setIsCreating(!isCreating)}
            size="sm"
            variant={isCreating ? "outline" : "default"}
          >
            {isCreating ? "Cancel" : "New Signature"}
          </Button>
        )}
      </div>

      {isCreating && (
        <div className="space-y-4 mb-4 p-4 border rounded-lg bg-gray-50">
          <div>
            <Label htmlFor="signatureName">Signature Name</Label>
            <Input
              id="signatureName"
              value={newSignatureName}
              onChange={(e) => setNewSignatureName(e.target.value)}
              placeholder="e.g., Professional, Personal"
            />
          </div>

          <div>
            <Label>Signature Content</Label>
            <div className="mt-2">
              <div className="flex gap-2 mb-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={insertImage}
                >
                  <ImageIcon className="w-4 h-4 mr-2" />
                  Insert Image
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>

              <div className="border rounded-lg overflow-hidden">
                <ReactQuill
                  ref={quillRef}
                  theme="snow"
                  value={newSignatureContent}
                  onChange={handleContentChange}
                  modules={modules}
                  formats={formats}
                  placeholder="Create your signature..."
                  style={{
                    minHeight: "200px",
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSaveSignature} size="sm">
              <Save className="w-4 h-4 mr-2" />
              {editingId ? "Update" : "Save"} Signature
            </Button>
            <Button onClick={cancelEditing} variant="outline" size="sm">
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {signatures.map((signature) => (
          <div
            key={signature.id}
            className="flex items-center justify-between p-3 border rounded-lg"
          >
            <div className="flex-1">
              <h4 className="font-medium">{signature.name}</h4>
              <div className="text-sm text-gray-600">
                <div
                  dangerouslySetInnerHTML={{
                    __html:
                      signature.content.substring(0, 100) +
                      (signature.content.length > 100 ? "..." : ""),
                  }}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleUseSignature(signature.content)}
              >
                Use
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleEditSignature(signature)}
              >
                <Edit className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteSignature(signature.id)}
                className="text-red-500 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
        {signatures.length === 0 && !isCreating && (
          <p className="text-gray-500 text-center py-4">
            No signatures saved yet
          </p>
        )}
      </div>
    </Card>
  );
};

export default SignatureManager;
