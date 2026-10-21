import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { voiceRequestModel, type TokenLookup } from "./voicerequest.model.ts";
import {
  createRequestSchema,
  requestIdParamSchema,
  submitRecordingSchema,
} from "./voicerequest.validator.ts";
import { renderRecorderPage, renderStatusPage } from "./requestPage.ts";
import { validationError, serverError } from "../../../utils/httpHelper.ts";
import { config } from "../../../config/env.ts";
type ActiveLookup = Extract<TokenLookup, { status: "active" }>;

/** Public base URL for links. Set PUBLIC_BASE_URL in production (e.g. https://api.yourapp.com). */
const getBaseUrl = (req: Request): string =>
  (config.publicRecordingBaseUrl ?? `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");

const DEAD_LINK_PAGES = {
  invalid: {
    emoji: "\u{1F50D}",
    title: "Link not found",
    message: "This link doesn't look right. Ask the person who sent it for a new one.",
  },
  used: {
    emoji: "\u2705",
    title: "Already sent",
    message: "A voice note has already been submitted with this link. Thank you!",
  },
  expired: {
    emoji: "\u23F0",
    title: "This link has expired",
    message: "Ask the person who sent it to share a fresh link with you.",
  },
  cancelled: {
    emoji: "\u{1F6AB}",
    title: "This request was cancelled",
    message: "The person who sent it has withdrawn this request.",
  },
} as const;

const DEAD_LINK_API_MESSAGES = {
  invalid: "This link is not valid",
  used: "This link has already been used",
  expired: "This link has expired",
  cancelled: "This request was cancelled",
} as const;

export const voiceRequestController = {
  /* ================================================================== */
  /* Authenticated (the requester)                                       */
  /* ================================================================== */

  async create(req: Request, res: Response) {
    const validation = createRequestSchema.safeParse(req.body);
    if (!validation.success) return validationError(res, validation.error);

    try {
      const { request, token } = await voiceRequestModel.create(
        req.user!.id,
        validation.data,
      );

      return res.status(201).json({
        success: true,
        message: "Request created. Share the link with the person you want to hear from.",
        data: {
          request: { ...request, link: `${getBaseUrl(req)}/r/${token}` },
        },
      });
    } catch (error: unknown) {
      return serverError(res, "voice request creation", error);
    }
  },

  async list(req: Request, res: Response) {
    try {
      const requests = await voiceRequestModel.list(req.user!.id);
      return res.status(200).json({ success: true, data: { requests } });
    } catch (error: unknown) {
      return serverError(res, "voice request listing", error);
    }
  },

  async cancel(req: Request, res: Response) {
    const validation = requestIdParamSchema.safeParse(req.params);
    if (!validation.success) return validationError(res, validation.error);

    try {
      const result = await voiceRequestModel.cancel(req.user!.id, validation.data.id);

      if (result === "not_found") {
        return res.status(404).json({ success: false, message: "Request not found" });
      }
      if (result === "not_pending") {
        return res.status(409).json({
          success: false,
          message: "Only pending requests can be cancelled",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Request cancelled. The link no longer works.",
      });
    } catch (error: unknown) {
      return serverError(res, "voice request cancellation", error);
    }
  },

  /* ================================================================== */
  /* Public (the recipient, no account)                                  */
  /* ================================================================== */

  /** GET /r/:token  ->  the recording web page */
  async page(req: Request, res: Response) {
    const token = String(req.params.token ?? "");

    // The token lives in the URL: keep it out of caches, referrers and search engines
    res.set({
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
    });

    try {
      const lookup = await voiceRequestModel.lookupByToken(token);

      if (lookup.status !== "active") {
        res.set(
          "Content-Security-Policy",
          "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
        );
        return res
          .status(lookup.status === "invalid" ? 404 : 410)
          .type("html")
          .send(renderStatusPage(DEAD_LINK_PAGES[lookup.status]));
      }

      const nonce = crypto.randomBytes(16).toString("base64");

      res.set(
        "Content-Security-Policy",
        [
          "default-src 'none'",
          `script-src 'nonce-${nonce}'`,
          "style-src 'unsafe-inline'",
          "connect-src 'self'",
          "media-src blob:",
          "base-uri 'none'",
          "form-action 'none'",
          "frame-ancestors 'none'",
        ].join("; "),
      );

      return res.status(200).type("html").send(
        renderRecorderPage({
          token,
          requesterName: lookup.requesterName,
          message: lookup.request.message,
          expiresAt: lookup.request.expires_at,
          nonce,
        }),
      );
    } catch (error: unknown) {
      console.error("Recording page failed:", error);
      return res.status(500).type("html").send(
        renderStatusPage({
          emoji: "\u26A0\uFE0F",
          title: "Something went wrong",
          message: "Please try again in a moment.",
        }),
      );
    }
  },

  /**
   * Runs BEFORE multer so a bad/used/expired token is rejected without the
   * server ever buffering the upload.
   */
  async ensureActiveToken(req: Request, res: Response, next: NextFunction) {
    try {
      const lookup = await voiceRequestModel.lookupByToken(String(req.params.token ?? ""));

      if (lookup.status !== "active") {
        return res.status(lookup.status === "invalid" ? 404 : 410).json({
          success: false,
          message: DEAD_LINK_API_MESSAGES[lookup.status],
        });
      }

      res.locals.activeRequest = lookup;
      return next();
    } catch (error: unknown) {
      return serverError(res, "link check", error);
    }
  },

  /** POST /api/v1/public/requests/:token/submit */
  async submit(req: Request, res: Response) {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No audio uploaded (send it as multipart field "audio")',
      });
    }

    const validation = submitRecordingSchema.safeParse(req.body);
    if (!validation.success) return validationError(res, validation.error);

    try {
      const { request } = res.locals.activeRequest as ActiveLookup;
      const result = await voiceRequestModel.submit(request, req.file, validation.data);

      if (result.status === "used") {
        return res.status(410).json({
          success: false,
          message: DEAD_LINK_API_MESSAGES.used,
        });
      }

      return res.status(201).json({
        success: true,
        message: "Thank you! Your voice note was sent.",
      });
    } catch (error: unknown) {
      return serverError(res, "recording submission", error);
    }
  },
};