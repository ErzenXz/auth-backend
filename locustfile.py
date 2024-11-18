from locust import HttpUser, task, between

class ApiUser(HttpUser):
    host = "https://xen-global-system-895330382127.europe-west1.run.app"
    wait_time = between(1, 5)

    @task
    def get_endpoint(self):
        self.client.get("/infrastructure-info")