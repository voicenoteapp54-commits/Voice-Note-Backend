import swaggerJsdoc from "swagger-jsdoc";

const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "VoiceNote API",
      version: "1.0.0",
      description: "VoiceNote backend API documentation",
    },
    servers: [
      {
        url: "http://localhost:10000",
        description: "Local development",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: ["./src/features/**/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(swaggerOptions);