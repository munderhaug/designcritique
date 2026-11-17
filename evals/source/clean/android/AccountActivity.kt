package app.sample.account

import androidx.activity.compose.BackHandler
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable

@Composable
fun AccountScreen(unsaved: Boolean, onDiscard: () -> Unit) {
    BackHandler(enabled = unsaved) { onDiscard() }
    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(selected = false, onClick = {}, icon = {}, label = { Text("Home") })
                NavigationBarItem(selected = true, onClick = {}, icon = {}, label = { Text("Account") })
            }
        },
    ) { _ ->
        Text("Account", style = MaterialTheme.typography.headlineSmall)
    }
}
