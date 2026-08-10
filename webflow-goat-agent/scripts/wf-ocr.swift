// wf-ocr.swift — text + per-string boxes out of an image, using the OS's own OCR (macOS Vision).
// Compiled on demand by shot-compile.js into scripts/.cache/wf-ocr and reused. No install, no network.
//
// Output: JSON array of { text, conf, x, y, w, h } in IMAGE pixels, origin top-left.
// Vision reports normalised boxes with a bottom-left origin; both conversions happen here so every
// consumer works in one coordinate system.
import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count > 1 else { print("{\"error\":\"usage: wf-ocr <image>\"}"); exit(2) }
guard let img = NSImage(contentsOfFile: args[1]),
      let tiff = img.tiffRepresentation,
      let bmp = NSBitmapImageRep(data: tiff),
      let cg = bmp.cgImage else { print("{\"error\":\"cannot read image: \(args[1])\"}"); exit(2) }

let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
req.usesLanguageCorrection = false          // a UI label is not prose; correction invents words
if #available(macOS 13.0, *) { req.automaticallyDetectsLanguage = true }

let handler = VNImageRequestHandler(cgImage: cg, options: [:])
do { try handler.perform([req]) } catch { print("{\"error\":\"ocr failed: \(error)\"}"); exit(2) }

let W = Double(cg.width), H = Double(cg.height)
var out: [String] = []
for obs in (req.results ?? []) {
    guard let cand = obs.topCandidates(1).first else { continue }
    let b = obs.boundingBox
    let x = b.origin.x * W
    let y = (1 - b.origin.y - b.height) * H     // flip to top-left origin
    let esc = cand.string
        .replacingOccurrences(of: "\\", with: "\\\\")
        .replacingOccurrences(of: "\"", with: "\\\"")
        .replacingOccurrences(of: "\n", with: " ")
    out.append("{\"text\":\"\(esc)\",\"conf\":\(cand.confidence),\"x\":\(Int(x)),\"y\":\(Int(y)),\"w\":\(Int(b.width * W)),\"h\":\(Int(b.height * H))}")
}
print("[" + out.joined(separator: ",") + "]")
