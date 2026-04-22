import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const securityQuestions = [
  "What was the name of the first school you attended?",
  "What was the model of your first personal computer?",
  "What is the name of the street where you first lived independently?",
  "What was the name of your first manager?",
  "What was the first concert or live event you attended?",
  "What was the name of your childhood best friend?",
  "What city were you in when you opened your first bank account?",
  "What was the name of your first pet?",
];

async function main() {
  for (const prompt of securityQuestions) {
    await prisma.securityQuestion.upsert({
      create: { prompt },
      update: { isActive: true },
      where: { prompt },
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
