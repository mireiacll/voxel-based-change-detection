FROM eclipse-temurin:21-jdk AS build

WORKDIR /workspace

COPY gradle gradle
COPY gradlew build.gradle settings.gradle ./
RUN chmod +x ./gradlew

COPY src src
RUN ./gradlew --no-daemon bootJar -x test

FROM eclipse-temurin:21-jre

WORKDIR /app

COPY --from=build /workspace/build/libs/*.jar /app/backend-api.jar

ENV SERVER_PORT=8080
ENV DB_HOST=postgis
ENV DB_PORT=5432
ENV DB_NAME=voxel_change_detection
ENV DB_USER=voxel
ENV DB_PASSWORD=voxel
ENV VOXELIZER_MOCK_EXECUTION=true
ENV VOXELIZER_STORAGE_ROOT=/data
ENV VOXELIZER_TEMP_PATH=/data/temp
ENV VOXELIZER_VISUALIZATION_TILES_PATH=/data/3dtiles
ENV VOXELIZER_VOXEL_SET_OUTPUT_PATH=/data/voxelsets
ENV VOXELIZER_JAR_PATH=/app/mago-voxelizer.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/backend-api.jar"]
