# Use Node.js LTS as base image
FROM node:18

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Expose the port Cloud Run will use
EXPOSE 8080

# Start the server
CMD ["npm", "start"]
